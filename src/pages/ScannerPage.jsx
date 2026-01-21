import React, { useState, useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';
import { supabase } from '../supabaseClient';
import { ScanFace, CheckCircle2, LogOut, Loader } from 'lucide-react';

const ScannerPage = () => {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceMatcher, setFaceMatcher] = useState(null);
  const [lastLog, setLastLog] = useState(null);
  const [detectingName, setDetectingName] = useState(null);

  const videoRef = useRef();
  const canvasRef = useRef();
  const isProcessing = useRef(false);
  const lastScanTime = useRef({});

  // 1. SETUP MODELS
  useEffect(() => {
    const loadResources = async () => {
      try {
        const MODEL_URL = `${import.meta.env.BASE_URL}models`;
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL), // Use TinyFace for Speed
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
          setFaceMatcher(new faceapi.FaceMatcher(labeledDescriptors, 0.60)); // Stricter Threshold (0.6)
          setModelsLoaded(true);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadResources();
  }, []);

  // 2. START CAMERA (Mobile Friendly)
  useEffect(() => {
    if (modelsLoaded) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        .then(stream => { if (videoRef.current) videoRef.current.srcObject = stream; })
        .catch(err => console.error(err));
    }
  }, [modelsLoaded]);

  // ... (Sound Effect - No Change) ...

  const playBeep = () => {
    // ... (Same as before)
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5);
    oscillator.stop(audioCtx.currentTime + 0.5);
  };


  // 3. LOGIC (No Change)
  const logAttendance = async (label) => {
    // ... (Same logic as before) ...
    if (isProcessing.current) return;

    const name = label.split(' (')[0];
    const rollNumber = label.split(' (')[1]?.replace(')', '');

    const now = Date.now();
    const lastTime = lastScanTime.current[rollNumber];
    if (lastTime && (now - lastTime < 5 * 60 * 1000)) return;

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
      playBeep();
      lastScanTime.current[rollNumber] = now;

      setTimeout(() => {
        setLastLog(null);
        isProcessing.current = false;
        setDetectingName(null);
      }, 3000);

    } catch (err) {
      console.error(err);
      isProcessing.current = false;
    }
  };


  // 4. DETECTION LOOP
  const handleVideoOnPlay = () => {
    setInterval(async () => {
      if (videoRef.current && canvasRef.current && faceMatcher && !isProcessing.current) {

        // Use TinyFaceDetector (Fast) with 512 input size (Better Detection)
        const detection = await faceapi.detectSingleFace(
          videoRef.current,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.5 })
        ).withFaceLandmarks().withFaceDescriptor();

        // Match to Visual Size (CLIENT WIDTH/HEIGHT)
        // This ensures the box matches the video element's displayed size
        const displaySize = { width: videoRef.current.clientWidth, height: videoRef.current.clientHeight };
        faceapi.matchDimensions(canvasRef.current, displaySize);

        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        if (detection) {
          const resized = faceapi.resizeResults(detection, displaySize);
          const result = faceMatcher.findBestMatch(resized.descriptor);
          const box = resized.detection.box;

          if (result.label !== 'unknown') {
            // GREEN BOX
            ctx.strokeStyle = '#00ff9d';
            ctx.lineWidth = 4;
            ctx.strokeRect(box.x, box.y, box.width, box.height);

            // NAME LABEL
            const name = result.label.split(' (')[0];
            ctx.font = 'bold 20px sans-serif';
            const textWidth = ctx.measureText(name).width;

            ctx.fillStyle = '#00ff9d';
            ctx.fillRect(box.x, box.y - 30, textWidth + 10, 30);

            ctx.fillStyle = 'black';
            ctx.fillText(name, box.x + 5, box.y - 8);

            setDetectingName(name);
            logAttendance(result.label);
          } else {
            // UNKNOWN (Subtle)
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            ctx.strokeRect(box.x, box.y, box.width, box.height);
            setDetectingName(null);
          }
        } else {
          setDetectingName(null);
        }
      }
    }, 500); // Check every 500ms (Reduced Lag)
  };

  const getUIState = () => {
    if (!lastLog) return 'IDLE';
    return lastLog.status === 'IN' ? 'SUCCESS_IN' : 'SUCCESS_OUT';
  };

  const uiState = getUIState();

  return (
    <div className="h-screen w-screen bg-black overflow-hidden relative">

      {/* FULL SCREEN VIDEO */}
      {/* Object-COVER ensures no black bars, but might crop face at edges. 
          Use a centered container to keep focus. */}
      <div className="absolute inset-0 z-0 flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay muted playsInline // Crucial for iOS
          onPlay={handleVideoOnPlay}
          className="w-full h-full object-cover transform scale-x-[-1] opacity-80"
        />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full transform scale-x-[-1]" />
      </div>

      {/* STATUS INDICATOR (TOP LEFT) */}
      <div className="absolute top-24 left-6 z-20 flex gap-3">
        <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center gap-2 shadow-lg">
          <div className={`w-2.5 h-2.5 rounded-full ${modelsLoaded ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-yellow-500'}`}></div>
          <span className="text-white/90 text-xs font-bold tracking-wider">{modelsLoaded ? "SYSTEM ONLINE" : "INITIALIZING..."}</span>
        </div>
      </div>

      {/* IDLE OVERLAY */}
      {uiState === 'IDLE' && (
        <div className="absolute bottom-10 left-0 right-0 z-20 flex flex-col items-center justify-center pointer-events-none p-6 text-center">
          <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center mb-4 border border-white/20 animate-pulse">
            <ScanFace className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-1 shadow-black drop-shadow-lg">Smart Gate</h2>
          <p className="text-white/80 text-sm">Face the camera to punch in/out</p>
        </div>
      )}

      {/* SUCCESS OVERLAY (FULL SCREEN) */}
      {uiState !== 'IDLE' && (
        <div className={`absolute inset-0 z-50 flex flex-col items-center justify-center p-6 animate-in fade-in zoom-in duration-300 ${uiState === 'SUCCESS_IN' ? 'bg-green-600/90 backdrop-blur-md' : 'bg-red-600/90 backdrop-blur-md'
          }`}>
          <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-sm w-full text-center">
            <div className={`w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center ${uiState === 'SUCCESS_IN' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
              }`}>
              {uiState === 'SUCCESS_IN' ? <CheckCircle2 className="w-10 h-10" /> : <LogOut className="w-10 h-10" />}
            </div>
            <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-1">
              {uiState === 'SUCCESS_IN' ? 'PUNCH IN' : 'PUNCH OUT'}
            </div>
            <h1 className="text-3xl font-black text-gray-900 mb-2">{lastLog.name}</h1>
            <p className="text-lg text-gray-500 font-medium">{lastLog.time}</p>
          </div>
        </div>
      )}

    </div>
  );
};

export default ScannerPage;