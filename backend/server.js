// server.js

// 1. IMPORT DEPENDENCIES
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const exceljs = require('exceljs'); // For Excel reports
const { startOfDay, endOfDay, parseISO } = require('date-fns'); // For date handling
const dotenv = require('dotenv');
dotenv.config();

// 2. INITIALIZE APP & SOCKET.IO
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST", "PUT"] }
});

// 3. MIDDLEWARE
app.use(cors());
app.use(express.json());

// 4. DATABASE CONNECTION
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.SECRET_KEY;

mongoose.connect(MONGO_URI)
    .then(() => console.log("MongoDB connected successfully."))
    .catch(err => console.error("MongoDB connection error:", err));

// 5. DATABASE SCHEMAS AND MODELS

// --- Teacher Model ---
const teacherSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, required: true},
    roomno: { type: String, required: true},
    isAvailable: { type: Boolean, default: false },
    lastAvailableTimestamp: { type: Date } // NEW: For time tracking
});
const Teacher = mongoose.model('Teacher', teacherSchema);

// --- NEW: Query Model ---
const querySchema = new mongoose.Schema({
    studentName: { type: String, required: true },
    queryText: { type: String, required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    status: { type: String, enum: ['pending', 'ended'], default: 'pending' },
    resolution: { type: String, enum: ['satisfied', 'not_satisfied', null], default: null }
}, { timestamps: true }); // `timestamps` adds createdAt and updatedAt automatically
const Query = mongoose.model('Query', querySchema);

// --- NEW: TimeRecord Model ---
const timeRecordSchema = new mongoose.Schema({
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    date: { type: Date, required: true },
    totalAvailableTime: { type: Number, default: 0 } // in seconds
});
const TimeRecord = mongoose.model('TimeRecord', timeRecordSchema);


// 6. AUTH MIDDLEWARE
const authMiddleware = (req, res, next) => {
    const token = req.header('x-auth-token');
    if (!token) return res.status(401).json({ message: 'No token, authorization denied' });
    try {
        req.teacher = jwt.verify(token, JWT_SECRET);
        next();
    } catch (e) {
        res.status(400).json({ message: 'Token is not valid' });
    }
};

// 7. API ROUTES

// --- Auth Routes (Unchanged) ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, phone, roomno } = req.body;

        if (!name || !email || !password || !phone || !roomno) {
            return res.status(400).json({ message: "Please provide all required fields." });
        }

        const existingTeacher = await Teacher.findOne({ email });
        if (existingTeacher) {
            return res.status(400).json({ message: "Teacher with this email already exists." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newTeacher = new Teacher({ name, email, password: hashedPassword , phone, roomno });
        await newTeacher.save();

        res.status(201).json({ message: "Teacher registered successfully." });

    } catch (error) {
        res.status(500).json({ message: "Server error during registration.", error: error.message });
    }
});
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


// --- Teacher Routes ---
app.get('/api/teachers', async (req, res) => {
    try {
        const teachers = await Teacher.find().select('-password'); // Exclude password from result
        res.json(teachers);
    } catch (error) {
        res.status(500).json({ message: "Server error fetching teachers.", error: error.message });
    }
});
// MAJOR UPDATE: Teacher Status and Time Tracking
app.put('/api/teachers/status', authMiddleware, async (req, res) => {
    try {
        const { isAvailable } = req.body;
        const teacherId = req.teacher.id;
        const teacher = await Teacher.findById(teacherId);
        if (!teacher) return res.status(404).json({ message: "Teacher not found." });

        // Time Tracking Logic
        if (teacher.isAvailable && !isAvailable) { // Going from Available to Not Available
            if (teacher.lastAvailableTimestamp) {
                const sessionDuration = (new Date() - new Date(teacher.lastAvailableTimestamp)) / 1000; // in seconds
                const today = startOfDay(new Date());

                // Find or create a time record for this teacher for today
                await TimeRecord.findOneAndUpdate(
                    { teacher: teacherId, date: today },
                    { $inc: { totalAvailableTime: sessionDuration } },
                    { upsert: true, new: true }
                );
            }
        }

        // Update teacher's status and timestamp
        teacher.isAvailable = isAvailable;
        teacher.lastAvailableTimestamp = isAvailable ? new Date() : null;
        await teacher.save();

        const allTeachers = await Teacher.find().select('-password');
        io.emit('statusUpdate', allTeachers);

        res.json(teacher);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error updating status.", error: error.message });
    }
});

// NEW: Get a specific teacher's time record for today
app.get('/api/teachers/my-time', authMiddleware, async(req, res) => {
    try {
        const today = startOfDay(new Date());
        const record = await TimeRecord.findOne({ teacher: req.teacher.id, date: today });
        res.json({ totalAvailableTime: record ? record.totalAvailableTime : 0 });
    } catch (error) {
        res.status(500).json({ message: "Server error fetching time record."});
    }
});

// --- NEW: Query Routes ---
// POST /api/queries - Create a new query
app.post('/api/queries', async (req, res) => {
    try {
        const { studentName, queryText, teacherId } = req.body;
        if (!studentName || !queryText || !teacherId) {
            return res.status(400).json({ message: "Missing required fields." });
        }
        const newQuery = new Query({ studentName, queryText, teacher: teacherId });
        await newQuery.save();

        // Notify the specific teacher in real-time
        io.to(teacherId).emit('newQuery', newQuery);

        res.status(201).json(newQuery);
    } catch (error) {
        res.status(500).json({ message: "Server error creating query.", error: error.message });
    }
});

// GET /api/queries/teacher - Get queries for the logged-in teacher
app.get('/api/queries/teacher', authMiddleware, async (req, res) => {
    try {
        const queries = await Query.find({ teacher: req.teacher.id, status: 'pending' }).sort({ createdAt: -1 });
        res.json(queries);
    } catch (error) {
        res.status(500).json({ message: "Server error fetching queries." });
    }
});

// PUT /api/queries/:id/end - Teacher ends a query session
app.put('/api/queries/:id/end', authMiddleware, async (req, res) => {
    try {
        const query = await Query.findOneAndUpdate(
            { _id: req.params.id, teacher: req.teacher.id },
            { status: 'ended' },
            { new: true }
        );
        if (!query) return res.status(404).json({ message: "Query not found or unauthorized." });
        
        // Notify everyone (or a specific student room if implemented) about the update
        io.emit('queryUpdated', query);
        res.json(query);
    } catch (error) {
        res.status(500).json({ message: "Server error ending query." });
    }
});

// PUT /api/queries/:id/resolve - Student marks query as satisfied/not satisfied
app.put('/api/queries/:id/resolve', async (req, res) => {
    try {
        const { resolution } = req.body;
        if (!['satisfied', 'not_satisfied'].includes(resolution)) {
            return res.status(400).json({ message: "Invalid resolution value." });
        }
        const query = await Query.findByIdAndUpdate(req.params.id, { resolution }, { new: true });
        if (!query) return res.status(404).json({ message: "Query not found." });
        
        io.emit('queryUpdated', query);
        res.json(query);
    } catch (error) {
        res.status(500).json({ message: "Server error resolving query." });
    }
});


// --- NEW: Daily Report Route ---
app.get('/api/reports/daily', async (req, res) => {
    try {
        const date = req.query.date ? parseISO(req.query.date) : new Date();
        const reportDateStart = startOfDay(date);
        const reportDateEnd = endOfDay(date);

        // 1. Fetch Data
        const timeRecords = await TimeRecord.find({ date: reportDateStart }).populate('teacher', 'name email');
        const queries = await Query.find({ 
            createdAt: { $gte: reportDateStart, $lt: reportDateEnd } 
        }).populate('teacher', 'name email').sort({createdAt: 1});

        // 2. Create Excel Workbook
        const workbook = new exceljs.Workbook();
        workbook.creator = 'Teacher Availability App';
        workbook.created = new Date();

        // Availability Sheet
        const availabilitySheet = workbook.addWorksheet('Teacher Availability');
        availabilitySheet.columns = [
            { header: 'Teacher Name', key: 'name', width: 30 },
            { header: 'Teacher Email', key: 'email', width: 30 },
            { header: 'Total Available Time (HH:MM:SS)', key: 'time', width: 35 },
        ];
        timeRecords.forEach(record => {
            availabilitySheet.addRow({
                name: record.teacher.name,
                email: record.teacher.email,
                time: new Date(record.totalAvailableTime * 1000).toISOString().substr(11, 8) // format as HH:MM:SS
            });
        });

        // Queries Sheet
        const querySheet = workbook.addWorksheet('Daily Queries');
        querySheet.columns = [
            { header: 'Time', key: 'time', width: 20 },
            { header: 'Student Name', key: 'student', width: 30 },
            { header: 'Teacher Name', key: 'teacher', width: 30 },
            { header: 'Query', key: 'query', width: 50 },
            { header: 'Resolution', key: 'resolution', width: 20 },
        ];
        queries.forEach(q => {
            querySheet.addRow({
                time: q.createdAt.toLocaleTimeString('en-US'),
                student: q.studentName,
                teacher: q.teacher.name,
                query: q.queryText,
                resolution: q.resolution || 'N/A'
            });
        });
        
        // 3. Send file to client
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="DailyReport-${date.toISOString().split('T')[0]}.xlsx"`);
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error("Report generation error:", error);
        res.status(500).send('Error generating report');
    }
});


// 8. SOCKET.IO LOGIC
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // NEW: Allow teachers to join a "room" based on their ID
    // The frontend will emit this event after a teacher logs in.
    socket.on('joinRoom', (teacherId) => {
        socket.join(teacherId);
        console.log(`Teacher with ID ${teacherId} joined their room.`);
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});


// 9. START SERVER
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));


