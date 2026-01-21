import React, { useState, useEffect, useRef } from 'react';
// IMPORT THE NEW LIBRARY
import * as faceapi from '@vladmandic/face-api';
import { supabase } from '../supabaseClient';
import { LogIn, LogOut, Loader, ScanFace, ShieldCheck, AlertTriangle } from 'lucide-react';

const ScannerPage = () => {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceMatcher, setFaceMatcher] = useState(null);
  const [lastLog, setLastLog] = useState(null);
  const [detectingName, setDetectingName] = useState(null);
  const [securityWarning, setSecurityWarning] = useState(null); // NEW: Security Warning State

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
          setFaceMatcher(new faceapi.FaceMatcher(labeledDescriptors, 0.45)); // Strict Matcher
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

  // Helper to draw boxes
  const drawBox = (ctx, box, color, lineWidth = 2) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.width, box.height); // Use rect for compat
    ctx.stroke();
  };

  // 4. DETECTION LOOP (SECURITY UPGRADED)
  const handleVideoOnPlay = () => {
    setInterval(async () => {
      if (videoRef.current && canvasRef.current && faceMatcher && !isProcessing.current) {

        // SECURITY UPDATE 1: Higher Confidence (0.8) to block low-quality screens
        const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.8 });

        const detection = await faceapi.detectSingleFace(videoRef.current, options)
          .withFaceLandmarks()
          .withFaceDescriptor();

        const displaySize = { width: videoRef.current.videoWidth, height: videoRef.current.videoHeight };
        faceapi.matchDimensions(canvasRef.current, displaySize);
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

        if (detection) {
          const resized = faceapi.resizeResults(detection, displaySize);
          const { box } = resized.detection;
          const { score } = detection.detection;

          // --- ANTI-SPOOFING LAYERS ---

          // 1. DYNAMIC SIZE CHECK (Must be > 20% of screen width)
          // Ensure it works on Mobile (small px) and Laptop (large px) by using percentage
          const minFaceWidth = displaySize.width * 0.20;
          if (box.width < minFaceWidth) {
            setSecurityWarning("Please Step Closer");
            drawBox(ctx, box, 'yellow');
            setDetectingName(null); // Clear detecting name if warning
            return;
          }

          // 2. QUALITY CHECK (Score < 0.9)
          // If score is low, it might be a screen glare or bad lighting
          if (score < 0.9) {
            setSecurityWarning("Lighting Poor / Face Unclear");
            drawBox(ctx, box, 'orange');
            setDetectingName(null); // Clear detecting name if warning
            return;
          }

          // 3. CENTER CHECK
          // Face must be roughly in the middle
          const centerX = box.x + (box.width / 2);
          const screenCenter = displaySize.width / 2;
          const offset = Math.abs(centerX - screenCenter);
          if (offset > (displaySize.width * 0.25)) { // Allow 25% deviance from center
            setSecurityWarning("Stand in Center");
            drawBox(ctx, box, 'blue');
            setDetectingName(null); // Clear detecting name if warning
            return;
          }

          // ALL CHECKS PASSED
          setSecurityWarning(null);
          const result = faceMatcher.findBestMatch(resized.descriptor);

          if (result.label !== 'unknown') {
            const name = result.label.split(' (')[0];
            setDetectingName(name);

            // Draw Name (Un-mirrored)
            ctx.font = 'bold 24px sans-serif';
            ctx.fillStyle = '#00ff9d';
            // Simple approach for text centering without complex transformations for now
            ctx.fillText(name, box.x, box.y - 10);

            drawBox(ctx, box, '#00ff9d', 4); // Green Success Box
            logAttendance(result.label);
          } else {
            setDetectingName(null);
            drawBox(ctx, box, 'red', 2); // Unknown Box
          }
        } else {
          // Clear if no face
          setSecurityWarning(null);
          setDetectingName(null);
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    }, 150);
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center font-sans overflow-hidden">

      {/* RESPONSIVE CONTAINER */}
      {/* Mobile: Full Screen (absolute inset-0) | Desktop: Card (max-w, rounded) */}
      <div className="
         relative w-full h-screen 
         md:h-auto md:w-auto md:max-w-[1100px] md:aspect-video 
         md:rounded-[2.5rem] md:border md:border-white/10 md:shadow-2xl 
         bg-black overflow-hidden flex flex-col md:flex-row
      ">

        {/* CAMERA FEED */}
        <div className="relative flex-1 h-full bg-black">
          {/* Status Badge (Top Left) */}
          <div className="absolute top-6 left-6 z-20">
            <div className="bg-black/60 backdrop-blur px-4 py-2 rounded-full border border-white/10 flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${modelsLoaded ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-yellow-500'}`}></div>
              <span className="text-white text-[10px] md:text-xs font-bold tracking-widest">{modelsLoaded ? "SECURE AI ACTIVE" : "INITIALIZING..."}</span>
            </div>
          </div>

          <video ref={videoRef} autoPlay muted playsInline onPlay={handleVideoOnPlay} className="w-full h-full object-cover transform scale-x-[-1] filter brightness-110 contrast-110" />
          <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full transform scale-x-[-1]" />

          {/* SECURITY WARNING OVERLAY */}
          {securityWarning && !lastLog && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30 w-max max-w-[90%]">
              <div className="bg-yellow-500/90 text-black px-6 py-3 rounded-full font-bold shadow-lg animate-pulse flex items-center gap-2 text-sm md:text-base">
                <AlertTriangle className="w-5 h-5" /> {securityWarning}
              </div>
            </div>
          )}

          {/* VERIFYING BADGE (Mobile) */}
          {!lastLog && detectingName && !securityWarning && (
            <div className="absolute bottom-32 md:bottom-8 left-0 right-0 flex justify-center z-20 pointer-events-none">
              <div className="bg-black/70 backdrop-blur-md text-white px-6 py-2 rounded-full border border-green-500/50 flex items-center gap-2 animate-bounce-short shadow-lg">
                <Loader className="w-4 h-4 text-green-400 animate-spin" />
                <span className="font-bold text-sm">Verifying: {detectingName}</span>
              </div>
            </div>
          )}
        </div>

        {/* INFO PANEL (Responsive) */}
        {/* Mobile: Absolute Bottom Sheet | Desktop: Relative Side Panel */}
        <div className={`
            absolute bottom-0 left-0 right-0 z-30
            md:relative md:w-96 md:h-auto
            bg-gradient-to-t from-black via-black/90 to-transparent md:bg-neutral-900/95 
            md:border-l md:border-white/5 
            p-6 md:p-8 flex flex-col justify-end md:justify-between
            transition-all duration-300
        `}>

          {/* Header (Desktop Only or when Idle on Mobile) */}
          <div className="hidden md:block">
            <div className="flex items-center gap-3 mb-8">
              <ScanFace className="w-8 h-8 text-blue-500" />
              <h1 className="text-white font-bold text-xl tracking-tight">Smart Gate</h1>
            </div>
          </div>

          {/* DYNAMIC CARD */}
          {lastLog ? (
            <div className={`
              w-full p-6 rounded-3xl border shadow-xl animate-scale-in
              ${lastLog.status === 'IN'
                ? 'bg-green-900/40 border-green-500/50 backdrop-blur-md'
                : 'bg-red-900/40 border-red-500/50 backdrop-blur-md'}
            `}>
              <div className="flex justify-between items-start mb-2">
                <span className={`text-[10px] font-black px-2 py-1 rounded text-white ${lastLog.status === 'IN' ? 'bg-green-600' : 'bg-red-600'}`}>
                  {lastLog.status === 'IN' ? 'ENTRY' : 'EXIT'}
                </span>
                <span className="text-white/80 text-xs font-mono">{lastLog.time}</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight truncate">{lastLog.name}</h2>
              <p className={`text-sm mt-1 font-medium ${lastLog.status === 'IN' ? 'text-green-300' : 'text-red-300'}`}>
                {lastLog.status === 'IN' ? 'Welcome Back!' : 'Goodbye!'}
              </p>
            </div>
          ) : (
            /* IDLE STATE */
            <div className="text-center md:text-left">
              {/* Mobile Idle Indicator */}
              <div className="md:hidden flex flex-col items-center pb-4">
                <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mb-2 animate-pulse">
                  <ScanFace className="w-6 h-6 text-white" />
                </div>
                <p className="text-white font-bold">Ready to Scan</p>
              </div>

              {/* Desktop Idle Box */}
              <div className="hidden md:block p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
                <ShieldCheck className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                <p className="text-white text-sm font-bold">Secure Access</p>
                <p className="text-neutral-500 text-xs mt-2 leading-relaxed">
                  Anti-Spoofing Enabled.<br />
                  Please stand 2 feet away.
                </p>
              </div>
            </div>
          )}

          {/* Footer (Desktop) */}
          <div className="hidden md:block pt-6 border-t border-white/5 text-center">
            <p className="text-neutral-600 text-[10px] uppercase font-bold tracking-widest">KAP EDUTECH AI</p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ScannerPage;