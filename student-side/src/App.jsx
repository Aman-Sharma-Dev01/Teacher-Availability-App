import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './App.css'; // Import the CSS file

// --- Configuration ---
// Make sure this points to your backend server URL
const API_URL = 'http://localhost:5000';
const socket = io(API_URL);

// --- Main App Component ---
export default function App() {
    const [teachers, setTeachers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Listen for the initial list of teachers when connecting
        socket.on('initialStatus', (initialTeachers) => {
            setTeachers(initialTeachers);
            setIsLoading(false);
        });

        // Listen for real-time updates
        socket.on('statusUpdate', (updatedTeachers) => {
            setTeachers(updatedTeachers);
        });

        // Clean up the socket connection when the component unmounts
        return () => {
            socket.off('initialStatus');
            socket.off('statusUpdate');
        };
    }, []);

    return (
        <div className="student-dashboard-container">
            <header className="dashboard-header">
                <div className="header-content">
                    <h1 className="header-title">
                        Teacher Availability
                    </h1>
                    <p className="header-subtitle">Real-time status of your teachers</p>
                </div>
            </header>
            <main>
                <div className="main-content">
                    {isLoading ? (
                        <p className="loading-text">Loading teacher statuses...</p>
                    ) : (
                        <div className="teachers-grid">
                            {teachers.map((teacher) => (
                                <TeacherCard key={teacher._id} teacher={teacher} />
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

// --- Teacher Card Component ---
function TeacherCard({ teacher }) {
    return (
        <div className="teacher-card">
            <div className="card-content">
                <div className="card-header">
                    {/* Status Indicator */}
                    <div className={`status-indicator ${teacher.isAvailable ? 'available' : 'unavailable'}`}></div>
                    
                    <div className="teacher-info">
                        <h3 className="teacher-name">{teacher.name}</h3>
                        <p className="teacher-email">Email: {teacher.email}</p>
                        <p className="teacher-email">Room No: {teacher.roomno}</p>
                        <p className="teacher-email">Phone No: {teacher.phone}</p>
                    </div>
                </div>
                <div className="card-footer">
                    <span className={`status-pill ${
                        teacher.isAvailable 
                        ? 'pill-available' 
                        : 'pill-unavailable'
                    }`}>
                        {teacher.isAvailable ? 'Available' : 'Not Available'}
                    </span>
                </div>
            </div>
        </div>
    );
}
