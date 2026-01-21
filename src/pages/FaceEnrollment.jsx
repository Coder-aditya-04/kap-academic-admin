import React, { useState, useEffect, useRef } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { supabase } from '../supabaseClient';
import { Camera, Save, UserCheck, AlertTriangle, Loader, Search } from 'lucide-react';

const FaceEnrollment = () => {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [detection, setDetection] = useState(null);
  const [cameraError, setCameraError] = useState(null);

  const videoRef = useRef();
  const canvasRef = useRef();

  const filteredStudents = students.filter(s =>
    s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.roll_number.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 1. Load Models & Students
  useEffect(() => {
    const loadResources = async () => {
      try {
        const MODEL_URL = `${import.meta.env.BASE_URL}models`;
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);

        // Fetch all students to allow re-enrollment
        const { data } = await supabase
          .from('students')
          .select('*')
          .order('id', { ascending: false });
        setStudents(data || []);

        setModelsLoaded(true);
      } catch (err) {
        console.error("Model Load Error:", err);
      }
    };
    loadResources();
  }, []);

  // 2. Start Camera (Only after models are loaded)
  useEffect(() => {
    if (modelsLoaded) {
      navigator.mediaDevices.getUserMedia({ video: {} })
        .then((stream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch((err) => {
          console.error("Camera Error:", err);
          setCameraError("Camera Access Denied. Please allow permission.");
        });
    }
  }, [modelsLoaded]);

  // 3. Detect Face Loop
  const handleVideoOnPlay = () => {
    setInterval(async () => {
      if (videoRef.current && canvasRef.current) {
        // Detect Face
        const detections = await faceapi.detectSingleFace(videoRef.current).withFaceLandmarks().withFaceDescriptor();

        if (detections) {
          setDetection(detections);

          // Draw Box
          const displaySize = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
          faceapi.matchDimensions(canvasRef.current, displaySize);
          const resizedDetections = faceapi.resizeResults(detections, displaySize);

          // Clear previous drawings
          canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

          // Draw new box
          faceapi.draw.drawDetections(canvasRef.current, resizedDetections);
        } else {
          setDetection(null);
          // Clear canvas if no face
          canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    }, 500);
  };

  // 4. Save Face Data
  const handleSave = async () => {
    if (!detection || !selectedStudent) return alert("Select student & Ensure face is visible");

    // Convert Float32Array to JSON String
    const descriptorStr = JSON.stringify(Array.from(detection.descriptor));

    const { error } = await supabase
      .from('students')
      .update({ face_descriptor: descriptorStr })
      .eq('id', selectedStudent.id);

    if (!error) {
      alert(`✅ Face Enrolled for ${selectedStudent.full_name}!`);
      setStudents(students.filter(s => s.id !== selectedStudent.id));
      setSelectedStudent(null);
    } else {
      alert("Error saving data: " + error.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 flex gap-8 h-screen">

      {/* LEFT: STUDENT LIST */}
      <div className="w-1/3 bg-white p-6 rounded-2xl shadow-xl border border-slate-200 flex flex-col ring-1 ring-slate-100/50">
        <div className="mb-6">
          <h2 className="font-bold text-2xl mb-2 bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">Face Enrollment</h2>
          <p className="text-slate-600 text-sm">Students awaiting AI training</p>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search student..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 space-y-2">
          {filteredStudents.length === 0 ? (
            <p className="text-gray-400 text-sm p-4 text-center">
              {searchQuery ? "No matching students." : "No pending students found."}
            </p>
          ) : filteredStudents.map(s => (
            <div
              key={s.id}
              onClick={() => setSelectedStudent(s)}
              className={`p-4 rounded-xl cursor-pointer transition border flex justify-between items-center ${selectedStudent?.id === s.id
                ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                : 'bg-gray-50 text-gray-700 border-transparent hover:bg-gray-100'
                }`}
            >
              <div>
                <p className="font-bold">{s.full_name}</p>
                <p className={`text-xs ${selectedStudent?.id === s.id ? 'text-blue-100' : 'text-gray-400'}`}>
                  {s.roll_number}
                </p>
              </div>
              {s.face_descriptor && (
                <UserCheck className={`w-5 h-5 ${selectedStudent?.id === s.id ? 'text-blue-200' : 'text-green-500'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: CAMERA */}
      <div className="flex-1 flex flex-col">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">AI Face Training</h1>
          <p className="text-slate-600">Train the neural network with student faces</p>
        </div>

        <div className="flex-1 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl overflow-hidden relative shadow-2xl border border-slate-700/50 ring-1 ring-white/10">

          {!modelsLoaded ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
              <Loader className="w-10 h-10 animate-spin mb-4 text-blue-500" />
              <p>Loading Neural Networks...</p>
            </div>
          ) : cameraError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-red-500">
              <AlertTriangle className="w-12 h-12 mb-4" />
              <p>{cameraError}</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                muted
                onPlay={handleVideoOnPlay}
                width="100%"
                height="100%"
                className="object-cover w-full h-full"
              />
              <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" />
            </>
          )}

          {/* Overlay Status */}
          <div className="absolute bottom-8 left-0 right-0 flex justify-center">
            {detection ? (
              <button
                onClick={handleSave}
                className="bg-green-500 hover:bg-green-600 text-white px-8 py-4 rounded-full font-bold flex items-center gap-3 shadow-xl transform hover:scale-105 transition"
              >
                <Save className="w-6 h-6" /> Save Face Data
              </button>
            ) : (
              <div className="bg-white/10 backdrop-blur-md text-white px-6 py-3 rounded-full text-sm font-bold flex items-center gap-2 border border-white/20">
                <AlertTriangle className="w-4 h-4 text-yellow-400" /> Face Not Detected
              </div>
            )}
          </div>
        </div>

        {/* Selected Student Info */}
        {selectedStudent && (
          <div className="mt-6 p-5 bg-blue-50 border border-blue-200 rounded-2xl flex items-center gap-4 animate-fade-in">
            <div className="bg-blue-600 p-3 rounded-full text-white shadow-lg">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-blue-600 uppercase font-bold tracking-wider">Ready to Train</p>
              <h3 className="text-2xl font-bold text-gray-900">{selectedStudent.full_name}</h3>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FaceEnrollment;