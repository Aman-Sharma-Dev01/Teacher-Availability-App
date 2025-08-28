// server.js

// 1. IMPORT DEPENDENCIES
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();


// 2. INITIALIZE APP & SOCKET.IO
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity
        methods: ["GET", "POST", "PUT"]
    }
});

// 3. MIDDLEWARE
app.use(cors());
app.use(express.json());

// 4. DATABASE CONNECTION (MongoDB)
// IMPORTANT: Replace with your own MongoDB connection string
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.SECRET_KEY; // Replace with a strong secret key

mongoose.connect(MONGO_URI)
    .then(() => console.log("MongoDB connected successfully."))
    .catch(err => console.error("MongoDB connection error:", err));

// 5. DATABASE SCHEMA AND MODEL
const teacherSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isAvailable: { type: Boolean, default: false }
});
const Teacher = mongoose.model('Teacher', teacherSchema);

// 6. API ROUTES

// --- AUTHENTICATION ROUTES ---

// POST /api/auth/register - Register a new teacher
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: "Please provide all required fields." });
        }

        const existingTeacher = await Teacher.findOne({ email });
        if (existingTeacher) {
            return res.status(400).json({ message: "Teacher with this email already exists." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newTeacher = new Teacher({ name, email, password: hashedPassword });
        await newTeacher.save();

        res.status(201).json({ message: "Teacher registered successfully." });

    } catch (error) {
        res.status(500).json({ message: "Server error during registration.", error: error.message });
    }
});

// POST /api/auth/login - Login a teacher
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const teacher = await Teacher.findOne({ email });
        if (!teacher) {
            return res.status(400).json({ message: "Invalid credentials." });
        }

        const isMatch = await bcrypt.compare(password, teacher.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials." });
        }

        const token = jwt.sign({ id: teacher._id }, JWT_SECRET, { expiresIn: '30d' });

        res.json({
            token,
            teacher: {
                id: teacher._id,
                name: teacher.name,
                email: teacher.email,
                isAvailable: teacher.isAvailable
            }
        });
    } catch (error) {
        res.status(500).json({ message: "Server error during login.", error: error.message });
    }
});

// --- MIDDLEWARE FOR AUTHENTICATION ---
const authMiddleware = (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.teacher = decoded;
        next();
    } catch (e) {
        res.status(400).json({ message: 'Token is not valid' });
    }
};


// --- TEACHER DATA ROUTES ---

// GET /api/teachers - Get all teachers' status
app.get('/api/teachers', async (req, res) => {
    try {
        const teachers = await Teacher.find().select('-password'); // Exclude password from result
        res.json(teachers);
    } catch (error) {
        res.status(500).json({ message: "Server error fetching teachers.", error: error.message });
    }
});

// PUT /api/teachers/status - Update a teacher's availability
app.put('/api/teachers/status', authMiddleware, async (req, res) => {
    try {
        const { isAvailable } = req.body;
        const teacherId = req.teacher.id;

        const updatedTeacher = await Teacher.findByIdAndUpdate(
            teacherId,
            { isAvailable },
            { new: true }
        ).select('-password');

        if (!updatedTeacher) {
            return res.status(404).json({ message: "Teacher not found." });
        }

        // After updating, broadcast the new list to all clients
        const allTeachers = await Teacher.find().select('-password');
        io.emit('statusUpdate', allTeachers);

        res.json(updatedTeacher);

    } catch (error) {
        res.status(500).json({ message: "Server error updating status.", error: error.message });
    }
});


// 7. SOCKET.IO LOGIC
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // When a new user connects, send them the current list of teachers
    Teacher.find().select('-password').then(teachers => {
        socket.emit('initialStatus', teachers);
    }).catch(err => {
        console.error("Error fetching initial status for socket:", err);
    });


    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});


// 8. START THE SERVER
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

// --- How to Run This Server ---
// 1. Make sure you have Node.js and npm installed.
// 2. Create a folder for your backend, navigate into it.
// 3. Run `npm init -y` to create a package.json file.
// 4. Install dependencies: `npm install express socket.io cors mongoose bcryptjs jsonwebtoken`
// 5. Save the code above as `server.js`.
// 6. IMPORTANT: Replace the `MONGO_URI` and `JWT_SECRET` with your actual credentials.
// 7. Run `node server.js` to start the server.

