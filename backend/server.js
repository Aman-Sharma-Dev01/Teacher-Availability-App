// server.js

// 1. IMPORT DEPENDENCIES
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const exceljs = require('exceljs');
const { startOfDay, endOfDay, parseISO } = require('date-fns');
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
    lastAvailableTimestamp: { type: Date } // For time tracking
});
const Teacher = mongoose.model('Teacher', teacherSchema);

// --- NEW: Student Model ---
const studentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
}, { timestamps: true });
const Student = mongoose.model('Student', studentSchema);


// --- Query Model ---
const querySchema = new mongoose.Schema({
    studentName: { type: String, required: true },
    queryText: { type: String, required: true },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    status: { type: String, enum: ['pending', 'ended'], default: 'pending' },
    resolution: { type: String, enum: ['satisfied', 'not_satisfied', null], default: null }
}, { timestamps: true });
const Query = mongoose.model('Query', querySchema);

// --- TimeRecord Model ---
const timeRecordSchema = new mongoose.Schema({
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    date: { type: Date, required: true },
    totalAvailableTime: { type: Number, default: 0 } // in seconds
});
const TimeRecord = mongoose.model('TimeRecord', timeRecordSchema);


// 6. AUTH MIDDLEWARE (Renamed for clarity)
const teacherAuthMiddleware = (req, res, next) => {
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

// --- Teacher Auth Routes ---
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

// --- NEW: Student Auth Routes ---
app.post('/api/student/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: "Please provide all required fields for student registration." });
        }

        const existingStudent = await Student.findOne({ email });
        if (existingStudent) {
            return res.status(400).json({ message: "A student with this email already exists." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newStudent = new Student({ name, email, password: hashedPassword });
        await newStudent.save();

        res.status(201).json({ message: "Student registered successfully." });

    } catch (error) {
        res.status(500).json({ message: "Server error during student registration.", error: error.message });
    }
});
app.post('/api/student/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const student = await Student.findOne({ email });
        if (!student) {
            return res.status(400).json({ message: "Invalid credentials." });
        }

        const isMatch = await bcrypt.compare(password, student.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials." });
        }

        const token = jwt.sign({ id: student._id, role: 'student' }, JWT_SECRET, { expiresIn: '30d' });

        res.json({
            token,
            student: {
                id: student._id,
                name: student.name,
                email: student.email,
            }
        });
    } catch (error) {
        res.status(500).json({ message: "Server error during student login.", error: error.message });
    }
});


// --- Teacher Routes ---
app.get('/api/teachers', async (req, res) => {
    try {
        const teachers = await Teacher.find().select('-password');
        res.json(teachers);
    } catch (error) {
        res.status(500).json({ message: "Server error fetching teachers.", error: error.message });
    }
});
app.put('/api/teachers/status', teacherAuthMiddleware, async (req, res) => {
    try {
        const { isAvailable } = req.body;
        const teacherId = req.teacher.id;
        const teacher = await Teacher.findById(teacherId);
        if (!teacher) return res.status(404).json({ message: "Teacher not found." });

        if (teacher.isAvailable && !isAvailable) {
            if (teacher.lastAvailableTimestamp) {
                const sessionDuration = (new Date() - new Date(teacher.lastAvailableTimestamp)) / 1000;
                const today = startOfDay(new Date());

                await TimeRecord.findOneAndUpdate(
                    { teacher: teacherId, date: today },
                    { $inc: { totalAvailableTime: sessionDuration } },
                    { upsert: true, new: true }
                );
            }
        }

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

app.get('/api/teachers/my-time', teacherAuthMiddleware, async(req, res) => {
    try {
        const today = startOfDay(new Date());
        const record = await TimeRecord.findOne({ teacher: req.teacher.id, date: today });
        res.json({ totalAvailableTime: record ? record.totalAvailableTime : 0 });
    } catch (error) {
        res.status(500).json({ message: "Server error fetching time record."});
    }
});

// --- Query Routes ---
app.post('/api/queries', async (req, res) => {
    try {
        const { studentName, queryText, teacherId } = req.body;
        if (!studentName || !queryText || !teacherId) {
            return res.status(400).json({ message: "Missing required fields." });
        }
        const newQuery = new Query({ studentName, queryText, teacher: teacherId });
        await newQuery.save();

        io.to(teacherId).emit('newQuery', newQuery);

        res.status(201).json(newQuery);
    } catch (error) {
        res.status(500).json({ message: "Server error creating query.", error: error.message });
    }
});

app.get('/api/queries/teacher', teacherAuthMiddleware, async (req, res) => {
    try {
        const queries = await Query.find({ teacher: req.teacher.id, status: 'pending' }).sort({ createdAt: -1 });
        res.json(queries);
    } catch (error) {
        res.status(500).json({ message: "Server error fetching queries." });
    }
});

app.put('/api/queries/:id/end', teacherAuthMiddleware, async (req, res) => {
    try {
        const query = await Query.findOneAndUpdate(
            { _id: req.params.id, teacher: req.teacher.id },
            { status: 'ended' },
            { new: true }
        );
        if (!query) return res.status(404).json({ message: "Query not found or unauthorized." });
        
        io.emit('queryUpdated', query);
        res.json(query);
    } catch (error) {
        res.status(500).json({ message: "Server error ending query." });
    }
});

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


// --- Daily Report Route ---
app.get('/api/reports/daily', async (req, res) => {
    try {
        const date = req.query.date ? parseISO(req.query.date) : new Date();
        const reportDateStart = startOfDay(date);
        const reportDateEnd = endOfDay(date);

        const timeRecords = await TimeRecord.find({
  date: { $gte: reportDateStart, $lt: reportDateEnd }
})
.populate('teacher', 'name email');
        const queries = await Query.find({ 
            createdAt: { $gte: reportDateStart, $lt: reportDateEnd } 
        }).populate('teacher', 'name email').sort({createdAt: 1});

        const workbook = new exceljs.Workbook();
        workbook.creator = 'Teacher Availability App';
        workbook.created = new Date();

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
                time: new Date(record.totalAvailableTime * 1000).toISOString().substr(11, 8)
            });
        });

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
