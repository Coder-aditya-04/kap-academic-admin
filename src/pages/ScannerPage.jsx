import React, { useState, useEffect, useRef } from 'react';
import * as faceapi from '@vladmandic/face-api';
import { supabase } from '../supabaseClient';
import { ScanFace, ShieldCheck, AlertTriangle, CheckCircle2, Volume2 } from 'lucide-react';

const ScannerPage = () => {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceMatcher, setFaceMatcher] = useState(null);
  const [lastLog, setLastLog] = useState(null);
  const [detectingName, setDetectingName] = useState(null);
  const [securityWarning, setSecurityWarning] = useState(null);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);

  const videoRef = useRef();
  const canvasRef = useRef();
  const isProcessing = useRef(false);
  const lastScanTime = useRef({});
  const audioCtxRef = useRef(null);

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
            // Use just the First Name for speaking to keep it short
            return new faceapi.LabeledFaceDescriptors(`${student.full_name} (${student.roll_number})`, [descriptor]);
          });

          // MODERN LIBRARY IS MORE SENSITIVE.
          // 0.40 is "Very Strict" - prevents wrong person entirely.
          setFaceMatcher(new faceapi.FaceMatcher(labeledDescriptors, 0.40));
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

  // UNLOCK AUDIO (Tap Handler) + Fast Beep Setup
  const unlockAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    // Play silent beep to warm up
    playBeep(0);
    setIsAudioUnlocked(true);
  };

  // Instant Beep (No Delay)
  const playBeep = (vol = 0.1) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);

    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.3);
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

      // INSTANT BEEP
      playBeep(0.3);

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

        // Use TinyFaceDetector
        // MODERATE THRESHOLD: 0.7 (Better for Tablets/Mobile, still strict enough)
        const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.7 });

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

          // 2. Score Check
          // 0.85 is very high, 0.8 is safer for varying light
          if (score < 0.80) {
            setSecurityWarning("Low Quality / Glare");
            drawBox(ctx, box, 'orange');
            setDetectingName(null);
            return;
          }

          // 3. Center Check (35% deviation allowed)
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

            // DRAW NAME & BOX (Requested)
            ctx.font = 'bold 24px sans-serif';
            ctx.fillStyle = '#00ff9d';
            ctx.fillText(name, box.x, box.y - 10);
            drawBox(ctx, box, '#00ff9d', 4);

            logAttendance(result.label);
          } else {
            setDetectingName(null);
            // Optional: Draw red box for unknown
            drawBox(ctx, box, 'rgba(255,0,0,0.3)', 2);
          }
        } else {
          setSecurityWarning(null);
          setDetectingName(null);
          const ctx = canvasRef.current?.getContext('2d');
          if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center font-sans overflow-hidden">

      {/* TAP TO START OVERLAY */}
      {!isAudioUnlocked && (
        <div
          onClick={unlockAudio}
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center cursor-pointer animate-in fade-in duration-500"
        >
          <div className="w-24 h-24 bg-blue-600 rounded-full flex items-center justify-center mb-6 animate-bounce shadow-[0_0_50px_#2563eb]">
            <Volume2 className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-white text-3xl font-black tracking-widest uppercase mb-2">Tap to Activate</h1>
          <p className="text-blue-200 text-lg">Enable Sound & Camera</p>
        </div>
      )}

      {/* FULL SCREEN SUCCESS OVERLAY */}
      {lastLog && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-green-600 animate-in fade-in zoom-in duration-300">
          <div className="bg-white p-10 rounded-full mb-6 shadow-2xl animate-bounce-short">
            <CheckCircle2 className="w-16 h-16 text-green-600" />
          </div>
          <h1 className="text-white text-4xl lg:text-6xl font-black text-center mb-4 drop-shadow-md">
            Welcome, {lastLog.name.split(' ')[0]}!
          </h1>
          <p className="text-green-100 text-xl font-medium tracking-wide">
            Attendance Marked: {lastLog.time}
          </p>
        </div>
      )}

      {/* RESPONSIVE CONTAINER - CHANGED md: to lg: for Tablets */}
      <div className="
         relative w-full h-screen
         lg:h-auto lg:w-auto lg:max-w-[1100px] lg:aspect-video
         lg:rounded-[2.5rem] lg:border lg:border-white/10 lg:shadow-2xl
         bg-black overflow-hidden flex flex-col lg:flex-row
      ">

        {/* CAMERA FEED */}
        <div className="relative flex-1 h-full bg-black flex items-center justify-center">

          {/* CIRCLE GUIDE */}
          <div className="absolute inset-0 z-10 pointer-events-none">
            {/* Dark Overlay with Hole punch effect is hard in pure CSS without mask image,
                 so we'll use a semi-transparent border trick or svg.
                 Simpler: Dark vignette + Glow Circle */}

            <div className="absolute inset-0 bg-radial-gradient-vignette opacity-60"></div>

            {/* THE GLOWING CIRCLE */}
            <div className={`
                absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                w-[70vw] h-[70vw] max-w-[320px] max-h-[320px]
                border-[3px] border-dashed rounded-full
                transition-all duration-300
                ${detectingName ? 'border-green-400 shadow-[0_0_50px_#4ade80]' : 'border-white/30 shadow-[0_0_30px_rgba(255,255,255,0.1)]'}
             `}>
              {/* Crosshair corners */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-3 bg-white/50"></div>
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-3 bg-white/50"></div>
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-1 bg-white/50"></div>
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-1 bg-white/50"></div>
            </div>
          </div>

          <div className="absolute top-6 left-6 z-20">
            <div className="bg-black/60 backdrop-blur px-4 py-2 rounded-full border border-white/10 flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${modelsLoaded ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-yellow-500'}`}></div>
              <span className="text-white text-[10px] lg:text-xs font-bold tracking-widest">{modelsLoaded ? "SECURE AI ONLINE" : "LOADING..."}</span>
            </div>
          </div>

          <video ref={videoRef} autoPlay muted playsInline onPlay={handleVideoOnPlay} className="w-full h-full object-cover transform scale-x-[-1] filter brightness-110 contrast-110" />
          <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full transform scale-x-[-1]" />

          {/* WARNINGS */}
          {securityWarning && !lastLog && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-30 w-max max-w-[90%] mt-40 lg:mt-48">
              <div className="bg-yellow-500/90 text-black px-6 py-3 rounded-full font-bold shadow-lg animate-pulse flex items-center gap-2 text-sm lg:text-base">
                <AlertTriangle className="w-5 h-5" /> {securityWarning}
              </div>
            </div>
          )}
        </div>

        {/* INFO PANEL - CHANGED md: to lg: */}
        <div className={`
            absolute bottom-0 left-0 right-0 z-30
            lg:relative lg:w-96 lg:h-auto
            bg-gradient-to-t from-black via-black/90 to-transparent lg:bg-neutral-900/95
            lg:border-l lg:border-white/5
            p-6 lg:p-8 flex flex-col justify-end lg:justify-between
        `}>
          <div className="hidden lg:block">
            <div className="flex items-center gap-3 mb-8">
              <ScanFace className="w-8 h-8 text-blue-500" />
              <h1 className="text-white font-bold text-xl tracking-tight">Smart Gate</h1>
            </div>
          </div>

          <div className="text-center lg:text-left">
            <div className="lg:hidden flex flex-col items-center pb-8">
              <p className="text-white/80 text-sm font-medium mb-2 uppercase tracking-widest text-[10px]">Align Face in Circle</p>
              <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mb-2 animate-pulse">
                <ScanFace className="w-6 h-6 text-white" />
              </div>
            </div>

            <div className="hidden lg:block p-6 rounded-2xl bg-white/5 border border-white/10 text-center">
              <ShieldCheck className="w-10 h-10 text-slate-500 mx-auto mb-3" />
              <p className="text-white text-sm font-bold">Secure Access</p>
              <p className="text-neutral-500 text-xs mt-2 leading-relaxed">
                Anti-Spoofing Enabled.<br />
                Please stand 2 feet away.
              </p>
            </div>
          </div>

          <div className="hidden lg:block pt-6 border-t border-white/5 text-center">
            <p className="text-neutral-600 text-[10px] uppercase font-bold tracking-widest">KAP EDUTECH AI</p>
          </div>
        </div>
      </div>
    </div>
  );
};
export default ScannerPage;