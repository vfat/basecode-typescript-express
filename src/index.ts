import express, { NextFunction, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt, { JwtPayload } from 'jsonwebtoken';
import {google} from 'googleapis';

const app = express();
const PORT = 5000;
const prisma = new PrismaClient();

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:5000/auth/google/callback'
);

const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
]

const authorizationUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    include_granted_scopes: true,
})


app.use(express.json())

interface UserData {
    id: string;
    name: string;
    address: string;
}

interface ValidationRequest extends Request {
    userData: UserData
}

const accessValidation = (req: Request, res: Response, next: NextFunction) => {
    const validationReq = req as ValidationRequest
    const {authorization} = validationReq.headers;

    console.log('here: ', authorization)

    if(!authorization){
        return res.status(401).json({
            message: 'Token diperlukan'
        })
    }

    const token = authorization.split(' ')[1];
    const secret = process.env.JWT_SECRET!;
    console.log('token: ', token)

    try {
        const jwtDecode = jwt.verify(token, secret);

        if(typeof jwtDecode !== 'string'){
            validationReq.userData = jwtDecode as UserData
        }
    } catch (error) {
        return res.status(401).json({
            message: 'Unauthorized',
            pesan: error
        })
    }
    next()
}

// GOOGLE Login
app.get('/auth/google', (req, res) => {
    res.redirect(authorizationUrl);
})

// GOOGLE callback login
app.get('/auth/google/callback', async (req, res) => {
    const {code} = req.query

    const {tokens} = await oauth2Client.getToken(code as string);

    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({
        auth: oauth2Client,
        version: 'v2'
    })

    const {data} = await oauth2.userinfo.get();

    if(!data.email || !data.name){
        return res.json({
            data: data,
        })
    }

    let user = await prisma.users.findFirst({
        where: {
            email: data.email
        }
    })

    if(!user){
        user = await prisma.users.create({
            data: {
                name: data.name,
                email: data.email,
                address: "",
                password: "12345678"
            }
        })
    }

    const payload = {
        id: user?.id,
        name: user?.name,
        address: user?.address
    }

    const secret = process.env.JWT_SECRET!;

    const expiresIn = Number(process.env.TOKEN_EXP!);

    const token = jwt.sign(payload, secret, {expiresIn: expiresIn})

    // return res.redirect(`http://localhost:3000/auth-success?token=${token}`)

    return res.json({
        data: {
            id: user.id,
            name: user.name,
            address: user.address
        },
        token: token
    })

})

// REGISTER
app.use('/register', async (req, res) => {
    const {name, email, password} = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await prisma.users.create({
        data: {
            name,
            email,
            password: hashedPassword,
        }
    })

    res.json({
        message: 'user created'
    })
})


// LOGIN
app.use('/login', async (req, res) => {
    const {email, password} = req.body;

    const user = await prisma.users.findFirst({
        where: {
            email: email
        }
    })

    if(!user) {
        return res.status(404).json({
            message: 'User not found'
        })
    }

    if(!user.password) {
        return res.status(404).json({
            message: 'Password not set'
        })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)

    if(isPasswordValid){
        const payload = {
            id: user.id,
            name: user.name,
            address: user.address
        }

        const secret = process.env.JWT_SECRET!;

        const expiresIn = Number(process.env.TOKEN_EXP!);

        const token = jwt.sign(payload, secret, {expiresIn: expiresIn})

        return res.json({
            data: {
                id: user.id,
                name: user.name,
                address: user.address
            },
            token: token
        })
    } else {
        return res.status(403).json({
            message: 'Wrong password'
        })
    }
})


// CREATE
app.post('/users',accessValidation,async (req, res) => {
    const {name, email, address, password} = req.body;

    const result = await prisma.users.create({
        data: {
            name: name,
            email: email,
            address: address,
            password: password
        }
    }) 
    res.json({
        data: result,
        message: `User created`
    })
})

// READ
app.get('/users',accessValidation, async (req, res) => {
    const result = await prisma.users.findMany({
        select: {
            id: true,
            name: true,
            email: true,
            address: true,
        }
    });
    res.json({
        data: result,
        message: 'User list'
    })
})

// UPDATE
app.patch('/users/:id',accessValidation, async (req, res) => {
    const {id} = req.params
    const {name, email, address} = req.body
    
    const result = await prisma.users.update({
        data: {
            name: name,
            email: email,
            address: address,
        },
        where: {
            id: Number(id)
        }
    })
    res.json({
        data: result,
        message: `User ${id} updated`
    })
})

// DELETE
app.delete('/users/:id',accessValidation, async (req, res) => {
    const {id} = req.params;

    const result = await prisma.users.delete({
        where: {
            id: Number(id)
        }
    })
    res.json({
        message: `User ${id} deleted`
    })
})

app.listen(PORT, () => {
    console.log(`Server running in PORT: ${PORT}`);
})