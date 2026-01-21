import React, { useState, useEffect, useRef } from 'react';
// IMPORT THE NEW LIBRARY
import * as faceapi from '@vladmandic/face-api';
import { supabase } from '../supabaseClient';
import { LogIn, LogOut, Loader, ScanFace, ShieldCheck } from 'lucide-react';

const ScannerPage = () => {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceMatcher, setFaceMatcher] = useState(null);
  const [lastLog, setLastLog] = useState(null);
  const [detectingName, setDetectingName] = useState(null);

  const videoRef = useRef();
  const canvasRef = useRef();
  const isProcessing = useRef(false);
  const lastScanTime = useRef({});

  // 1. SETUP: Configure AI & Load Models
  useEffect(() => {
    const loadResources = async () => {
      try {
        // Initialize TensorFlow Backend (GPU acceleration)
        await faceapi.tf.setBackend('webgl');
        await faceapi.tf.ready();

        const MODEL_URL = `${import.meta.env.BASE_URL}models`;

        // Load the High-Accuracy Models
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL), // Best detection
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);

        const { data: students } = await supabase
          .from('students')
          .select('full_name, roll_number, face_descriptor')
          .not('face_descriptor', 'is', null);

        if (students && students.length > 0) {
          const labeledDescriptors = students.map(student => {
            const descriptor = new Float32Array(JSON.parse(student.face_descriptor));
            return new faceapi.LabeledFaceDescriptors(`${student.full_name} (${student.roll_number})`, [descriptor]);
          });

          // MODERN LIBRARY IS MORE SENSITIVE. 
          // 0.5 is a good balance for the new library.
          setFaceMatcher(new faceapi.FaceMatcher(labeledDescriptors, 0.5));
          setModelsLoaded(true);
        }
      } catch (err) {
        console.error("AI Error:", err);
      }
    };
    loadResources();
  }, []);

  // 2. START CAMERA (HD Resolution)
  useEffect(() => {
    if (modelsLoaded) {
      navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      })
        .then(stream => { if (videoRef.current) videoRef.current.srcObject = stream; })
        .catch(err => console.error(err));
    }
  }, [modelsLoaded]);

  // 3. LOGIC (Same as before)
  const logAttendance = async (label) => {
    if (isProcessing.current) return;

    const name = label.split(' (')[0];
    const rollNumber = label.split(' (')[1]?.replace(')', '');

    const now = Date.now();
    const lastTime = lastScanTime.current[rollNumber];
    if (lastTime && (now - lastTime < 30 * 60 * 1000)) return;

    isProcessing.current = true;

    try {
      const today = new Date().toISOString().split('T')[0];
      const { data: logs } = await supabase
        .from('gate_logs')
        .select('*')
        .eq('roll_number', rollNumber)
        .eq('date_only', today)
        .order('scan_time', { ascending: false })
        .limit(1);

      let newStatus = 'IN';
      if (logs && logs.length > 0 && logs[0].scan_type === 'IN') newStatus = 'OUT';

      await supabase.from('gate_logs').insert([{
        roll_number: rollNumber,
        student_name: name,
        scan_type: newStatus
      }]);

      setLastLog({ name, status: newStatus, time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) });
      new Audio('https://actions.google.com/sounds/v1/science_fiction/beep_short.ogg').play();
      lastScanTime.current[rollNumber] = now;

      setTimeout(() => {
        setLastLog(null);
        isProcessing.current = false;
        setDetectingName(null);
      }, 4000);

    } catch (err) {
      console.error(err);
      isProcessing.current = false;
    }
  };

  // 4. DETECTION LOOP
  const handleVideoOnPlay = () => {
    setInterval(async () => {
      if (videoRef.current && canvasRef.current && faceMatcher && !isProcessing.current) {

        // Use detectSingleFace for Kiosk Mode (It's faster and focuses on one person)
        const detection = await faceapi.detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection) {
          const displaySize = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
          faceapi.matchDimensions(canvasRef.current, displaySize);

          const resized = faceapi.resizeResults(detection, displaySize);
          const result = faceMatcher.findBestMatch(resized.descriptor);

          const ctx = canvasRef.current.getContext('2d');
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

          const { box } = resized.detection;

          // FACE SIZE CHECK (Anti-Spoofing)
          // If box width is too small, they are too far or holding a small phone
          if (box.width < 150) {
            // Draw Yellow "Come Closer" Box
            ctx.strokeStyle = 'yellow';
            ctx.lineWidth = 2;
            ctx.strokeRect(box.x, box.y, box.width, box.height);
            setDetectingName("Come Closer...");
            return;
          }

          if (result.label !== 'unknown') {
            // Draw Green Success Box
            ctx.strokeStyle = '#00ff9d';
            ctx.lineWidth = 4;
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#00ff9d";
            ctx.strokeRect(box.x, box.y, box.width, box.height);

            setDetectingName(result.label.split(' (')[0]);
            logAttendance(result.label);
          } else {
            // Draw Red Unknown Box
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2;
            ctx.strokeRect(box.x, box.y, box.width, box.height);
            setDetectingName(null);
          }
        } else {
          // Clear if no face
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          setDetectingName(null);
        }
      }
    }, 100); // Faster check (100ms) because new library is faster
  };

  return (
    <div className="h-screen bg-neutral-950 flex items-center justify-center p-4 font-sans">
      <div className="relative w-full max-w-[900px] bg-black/40 backdrop-blur-xl rounded-[2.5rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col md:flex-row">

        {/* CAMERA FEED */}
        <div className="relative flex-1 aspect-[4/3] bg-black overflow-hidden">
          <div className="absolute top-6 left-6 z-20">
            <div className="bg-black/60 backdrop-blur px-4 py-2 rounded-full border border-white/10 flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${modelsLoaded ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-yellow-500'}`}></div>
              <span className="text-white text-xs font-bold tracking-widest">{modelsLoaded ? "AI ENGINE 2.0 ACTIVE" : "LOADING..."}</span>
            </div>
          </div>

          <video ref={videoRef} autoPlay muted playsInline onPlay={handleVideoOnPlay} className="w-full h-full object-cover transform scale-x-[-1] filter brightness-110 contrast-110" />
          <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full transform scale-x-[-1]" />

          {!lastLog && detectingName && (
            <div className="absolute bottom-8 left-0 right-0 flex justify-center z-20">
              <div className="bg-black/70 backdrop-blur-md text-white px-6 py-3 rounded-full border border-green-500/50 flex items-center gap-3 animate-bounce-short">
                <Loader className="w-5 h-5 text-green-400 animate-spin" />
                <span className="font-bold text-base">{detectingName}</span>
              </div>
            </div>
          )}
        </div>

        {/* INFO PANEL (Right Side) */}
        <div className="w-full md:w-80 bg-neutral-900/90 border-l border-white/5 p-8 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-8">
              <ScanFace className="w-8 h-8 text-blue-500" />
              <h1 className="text-white font-bold text-xl tracking-tight">Smart Gate</h1>
            </div>

            {lastLog ? (
              <div className={`p-6 rounded-2xl border animate-fade-in ${lastLog.status === 'IN' ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                <div className="flex justify-between items-start mb-3">
                  <span className={`text-xs font-black px-2 py-1 rounded text-white ${lastLog.status === 'IN' ? 'bg-green-600' : 'bg-red-600'}`}>{lastLog.status === 'IN' ? 'ENTRY' : 'EXIT'}</span>
                  <span className="text-white/60 text-xs font-mono">{lastLog.time}</span>
                </div>
                <h2 className="text-2xl font-bold text-white leading-tight">{lastLog.name}</h2>
                <p className={`text-sm mt-2 font-medium ${lastLog.status === 'IN' ? 'text-green-400' : 'text-red-400'}`}>{lastLog.status === 'IN' ? 'Welcome Back!' : 'Goodbye!'}</p>
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
                <ShieldCheck className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                <p className="text-white text-sm font-bold">Secure Access</p>
                <p className="text-neutral-500 text-xs mt-2 leading-relaxed">System is running on high-accuracy mode.</p>
              </div>
            )}
          </div>

          <div className="pt-6 border-t border-white/5 text-center">
            <p className="text-neutral-600 text-[10px] uppercase font-bold tracking-widest">KAP EDUTECH AI</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScannerPage;