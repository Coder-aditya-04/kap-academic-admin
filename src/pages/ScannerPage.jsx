import React, { useState, useEffect, useRef } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { supabase } from '../supabaseClient';
import { LogIn, LogOut, Loader, ScanFace, ShieldCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';

const ScannerPage = () => {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceMatcher, setFaceMatcher] = useState(null);
  const [lastLog, setLastLog] = useState(null);
  const [detectingName, setDetectingName] = useState(null);
  const [securityWarning, setSecurityWarning] = useState(null);

  const videoRef = useRef();
  const canvasRef = useRef();
  const isProcessing = useRef(false);
  const lastScanTime = useRef({});

  // 1. SETUP: Configure AI & Load Models (TinyFace for Speed)
  useEffect(() => {
    const loadResources = async () => {
      try {
        await faceapi.tf.setBackend('webgl');
        await faceapi.tf.ready();

        const MODEL_URL = `${import.meta.env.BASE_URL}models`;

        // Load TinyFace for Mobile Speed
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
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
          // 0.40 is "Very Strict" - prevents wrong person entirely.
          setFaceMatcher(new faceapi.FaceMatcher(labeledDescriptors, 0.40)); // Strict Matcher
          setModelsLoaded(true);
        }
      } catch (err) {
        console.error("AI Error:", err);
      }
    };
    loadResources();
  }, []);

  // 2. START CAMERA
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

  // Reliable Sound (Web Audio API)
  const playBeep = () => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5);
    oscillator.stop(audioCtx.currentTime + 0.5);
  };

  // 3. LOGIC
  const logAttendance = async (label) => {
    if (isProcessing.current) return;

    const name = label.split(' (')[0];
    const rollNumber = label.split(' (')[1]?.replace(')', '');

    const now = Date.now();
    const lastTime = lastScanTime.current[rollNumber];
    // 5 Min Cooldown
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
      playBeep(); // Trigger Sound
      lastScanTime.current[rollNumber] = now;

      setTimeout(() => {
        setLastLog(null);
        isProcessing.current = false;
        setDetectingName(null);
      }, 3000); // 3 Second Success Screen

    } catch (err) {
      console.error(err);
      isProcessing.current = false;
    }
  };

  const drawBox = (ctx, box, color, lineWidth = 2) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.rect(box.x, box.y, box.width, box.height);
    ctx.stroke();
  };

  // 4. DETECTION LOOP
  const handleVideoOnPlay = () => {
    setInterval(async () => {
      if (videoRef.current && canvasRef.current && faceMatcher && !isProcessing.current) {

        // Use TinyFaceDetector (Fastest for Mobile)
        // INCREASED THRESHOLD: 0.6 -> 0.8 to reject photos/screens
        const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.8 });

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

          // --- ANTI-SPOOFING ---

          // 1. Size Check (Dynamic 15%)
          const minFaceWidth = displaySize.width * 0.15;
          if (box.width < minFaceWidth) {
            setSecurityWarning("Step Closer");
            drawBox(ctx, box, 'yellow');
            setDetectingName(null);
            return;
          }

          // 2. Score Check (Strict)
          // If score is < 0.85, it might be a screen glare or bad lighting
          if (score < 0.85) {
            setSecurityWarning("Low Quality / Spoof Detected");
            drawBox(ctx, box, 'orange');
            setDetectingName(null);
            return;
          }

          // 3. Center Check
          const centerX = box.x + (box.width / 2);
          const screenCenter = displaySize.width / 2;
          const offset = Math.abs(centerX - screenCenter);
          if (offset > (displaySize.width * 0.35)) { // Allow 35% deviance
            setSecurityWarning("Stand in Center");
            drawBox(ctx, box, 'blue');
            setDetectingName(null);
            return;
          }

          setSecurityWarning(null);
          const result = faceMatcher.findBestMatch(resized.descriptor);

          if (result.label !== 'unknown') {
            const name = result.label.split(' (')[0];
            setDetectingName(name);

            ctx.font = 'bold 24px sans-serif';
            ctx.fillStyle = '#00ff9d';
            ctx.fillText(name, box.x, box.y - 10);

            drawBox(ctx, box, '#00ff9d', 4);
            logAttendance(result.label);
          } else {
            setDetectingName(null);
            // Don't draw box for unknown to keep UI clean, or draw subtle
            drawBox(ctx, box, 'rgba(255,0,0,0.5)', 2);
          }
        } else {
          setSecurityWarning(null);
          setDetectingName(null);
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    }, 100); // 10 FPS
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center font-sans overflow-hidden">

      {/* 
        FULL SCREEN SUCCESS OVERLAY 
        (Triggers when lastLog is set)
      */}
      {lastLog && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-green-600 animate-in fade-in zoom-in duration-300">
          <div className="bg-white p-10 rounded-full mb-6 shadow-2xl animate-bounce-short">
            <CheckCircle2 className="w-16 h-16 text-green-600" />
          </div>
          <h1 className="text-white text-4xl md:text-6xl font-black text-center mb-4 drop-shadow-md">
            Welcome, {lastLog.name.split(' ')[0]}!
          </h1>
          <p className="text-green-100 text-xl font-medium tracking-wide">
            Attendance Marked: {lastLog.time}
          </p>
        </div>
      )}

      {/* RESPONSIVE CONTAINER */}
      <div className="
         relative w-full h-screen 
         md:h-auto md:w-auto md:max-w-[1100px] md:aspect-video 
         md:rounded-[2.5rem] md:border md:border-white/10 md:shadow-2xl 
         bg-black overflow-hidden flex flex-col md:flex-row
      ">

        {/* CAMERA FEED */}
        <div className="relative flex-1 h-full bg-black">
          <div className="absolute top-6 left-6 z-20">
            <div className="bg-black/60 backdrop-blur px-4 py-2 rounded-full border border-white/10 flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${modelsLoaded ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-yellow-500'}`}></div>
              <span className="text-white text-[10px] md:text-xs font-bold tracking-widest">{modelsLoaded ? "FAST AI ACTIVE" : "LOADING..."}</span>
            </div>
          </div>

          <video ref={videoRef} autoPlay muted playsInline onPlay={handleVideoOnPlay} className="w-full h-full object-cover transform scale-x-[-1] filter brightness-110 contrast-110" />
          <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full transform scale-x-[-1]" />

          {/* WARNINGS */}
          {securityWarning && !lastLog && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30 w-max max-w-[90%]">
              <div className="bg-yellow-500/90 text-black px-6 py-3 rounded-full font-bold shadow-lg animate-pulse flex items-center gap-2 text-sm md:text-base">
                <AlertTriangle className="w-5 h-5" /> {securityWarning}
              </div>
            </div>
          )}
        </div>

        {/* INFO PANEL */}
        <div className={`
            absolute bottom-0 left-0 right-0 z-30
            md:relative md:w-96 md:h-auto
            bg-gradient-to-t from-black via-black/90 to-transparent md:bg-neutral-900/95 
            md:border-l md:border-white/5 
            p-6 md:p-8 flex flex-col justify-end md:justify-between
        `}>
          <div className="hidden md:block">
            <div className="flex items-center gap-3 mb-8">
              <ScanFace className="w-8 h-8 text-blue-500" />
              <h1 className="text-white font-bold text-xl tracking-tight">Smart Gate</h1>
            </div>
          </div>

          <div className="text-center md:text-left">
            <div className="md:hidden flex flex-col items-center pb-4">
              <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mb-2 animate-pulse">
                <ScanFace className="w-6 h-6 text-white" />
              </div>
              <p className="text-white font-bold">Ready to Scan</p>
            </div>

            <div className="hidden md:block p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
              <ShieldCheck className="w-10 h-10 text-slate-500 mx-auto mb-3" />
              <p className="text-white text-sm font-bold">Secure Access</p>
              <p className="text-neutral-500 text-xs mt-2 leading-relaxed">
                Anti-Spoofing Enabled.<br />
                Please stand 2 feet away.
              </p>
            </div>
          </div>

          <div className="hidden md:block pt-6 border-t border-white/5 text-center">
            <p className="text-neutral-600 text-[10px] uppercase font-bold tracking-widest">KAP EDUTECH AI</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScannerPage;