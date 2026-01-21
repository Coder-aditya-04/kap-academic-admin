import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { BarChart, Users, Phone, XCircle, FileDown, Search } from 'lucide-react';

const AttendanceReports = () => {
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  // 4. DAILY LOGS LOGIC
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'logs' | 'student_history'
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyLogs, setDailyLogs] = useState([]);
  const [selectedStudentHistory, setSelectedStudentHistory] = useState(null); // { name, logs: [] }

  // 1. Load Batches
  useEffect(() => {
    const loadBatches = async () => {
      const { data } = await supabase.from('students').select('batch');
      if (data) {
        const unique = [...new Set(data.map(item => item.batch).filter(Boolean))];
        setBatches(unique);
      }
    };
    loadBatches();
  }, []);

  // 2. Generate Report Logic
  const generateReport = async () => {
    if (!selectedBatch) return;
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    try {
      const { data: allStudents } = await supabase.from('students').select('*').eq('batch', selectedBatch);
      const { data: logs } = await supabase.from('gate_logs').select('roll_number').eq('date_only', today).eq('scan_type', 'IN');

      const presentRolls = logs.map(l => l.roll_number);
      const presentList = [];
      const absentList = [];

      allStudents.forEach(student => {
        if (presentRolls.includes(student.roll_number)) presentList.push(student);
        else absentList.push(student);
      });

      setReport({
        total: allStudents.length,
        present: presentList,
        absent: absentList,
        percentage: Math.round((presentList.length / allStudents.length) * 100) || 0
      });

    } catch (err) { console.error(err); }
    setLoading(false);
  };

  // 3. EXPORT TO CSV FUNCTION
  const downloadCSV = () => {
    if (!report || report.absent.length === 0) return alert("No absent students to export.");

    const headers = ["Roll Number", "Student Name", "Parent Phone", "Batch"];
    const rows = report.absent.map(s => [s.roll_number, s.full_name, s.phone, s.batch]);

    let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Absent_List_${selectedBatch}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
  };

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchDailyLogs();
    }
  }, [logDate, activeTab]);

  const fetchDailyLogs = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('gate_logs')
        .select('*')
        .eq('date_only', logDate)
        .order('scan_time', { ascending: false });
      setDailyLogs(data || []);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const fetchStudentHistory = async (rollNumber, name) => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('gate_logs')
        .select('*')
        .eq('roll_number', rollNumber)
        .order('date_only', { ascending: false })
        .order('scan_time', { ascending: false });

      setSelectedStudentHistory({ name, logs: data || [] });
      setActiveTab('student_history');
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  return (
    <div className="max-w-6xl mx-auto pb-20">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">Attendance Analytics</h1>
          <p className="text-slate-600 mt-2">Real-time batch performance insights</p>
        </div>

        {/* TABS */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'overview' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >Overview</button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition ${activeTab === 'logs' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >Daily Logs</button>
        </div>
      </div>

      {activeTab === 'overview' ? (
        <>
          {/* CONTROLS */}
          <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-200 mb-8 flex gap-6 items-end ring-1 ring-slate-100/50">
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Select Batch</label>
              <select
                className="w-full p-3 border rounded-lg bg-slate-50 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
              >
                <option value="">-- Choose Batch --</option>
                {batches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <button
              onClick={generateReport}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-3 rounded-xl font-bold hover:shadow-xl transition-all duration-200 h-[50px] shadow-lg hover:scale-105"
            >
              {loading ? "Analyzing..." : "Get Report"}
            </button>
          </div>

          {/* RESULTS */}
          {report && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

              {/* Graph */}
              <div className="bg-white p-6 rounded-2xl shadow-lg border border-slate-100 text-center lg:col-span-1">
                <h3 className="text-gray-500 font-bold uppercase text-xs mb-6">Attendance Overview</h3>
                <div className="relative w-48 h-48 mx-auto mb-6 rounded-full border-[16px] border-slate-100 flex items-center justify-center">
                  <div
                    className="absolute inset-0 rounded-full border-[16px] border-green-500"
                    style={{ clipPath: `polygon(0 0, 100% 0, 100% ${report.percentage}%, 0 ${report.percentage}%)` }}
                  ></div>
                  <div>
                    <span className="text-4xl font-extrabold text-slate-800">{report.percentage}%</span>
                    <p className="text-xs text-slate-400">Present</p>
                  </div>
                </div>
                <div className="flex justify-between px-4">
                  <div className="text-center"><p className="text-2xl font-bold text-green-600">{report.present.length}</p><p className="text-xs font-bold text-gray-400">PRESENT</p></div>
                  <div className="text-center"><p className="text-2xl font-bold text-red-500">{report.absent.length}</p><p className="text-xs font-bold text-gray-400">ABSENT</p></div>
                </div>
              </div>

              {/* Absent List */}
              <div className="bg-white rounded-2xl shadow-lg border border-red-100 lg:col-span-2 overflow-hidden flex flex-col h-[400px]">
                <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex justify-between items-center">
                  <h3 className="font-bold text-red-800 flex items-center gap-2">
                    <XCircle className="w-5 h-5" /> Absent Students ({report.absent.length})
                  </h3>
                  <button
                    onClick={downloadCSV}
                    className="text-xs bg-white text-red-600 px-3 py-2 rounded-lg font-bold shadow-sm flex items-center gap-2 hover:bg-red-100 transition"
                  >
                    <FileDown className="w-4 h-4" /> Export CSV
                  </button>
                </div>

                <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
                  {report.absent.map(student => (
                    <div key={student.id} className="p-4 flex justify-between items-center hover:bg-red-50/30 transition">
                      <div className="cursor-pointer" onClick={() => fetchStudentHistory(student.roll_number, student.full_name)}>
                        <p className="font-bold text-slate-800 hover:text-blue-600 underline decoration-dotted underline-offset-4">{student.full_name}</p>
                        <p className="text-xs text-slate-400">Roll: {student.roll_number}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-600 flex items-center justify-end gap-2">
                          <Phone className="w-3 h-3 text-slate-400" /> {student.phone}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      ) : activeTab === 'logs' ? (
        /* DAILY LOGS VIEW */
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Daily Logs</h2>
              <p className="text-xs text-slate-500">Full timeline of student entries/exits</p>
            </div>
            <div>
              <input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="p-2 border rounded-lg bg-white font-bold text-slate-600 text-sm shadow-sm outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                <tr>
                  <th className="px-6 py-4">Time</th>
                  <th className="px-6 py-4">Student Name</th>
                  <th className="px-6 py-4">Roll Number</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailyLogs.length === 0 ? (
                  <tr><td colSpan="4" className="p-8 text-center text-slate-400">No logs found for this date.</td></tr>
                ) : dailyLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4 font-mono text-slate-500">{log.scan_time}</td>
                    <td
                      className="px-6 py-4 font-bold text-slate-800 cursor-pointer hover:text-blue-600 underline decoration-dotted underline-offset-4"
                      onClick={() => fetchStudentHistory(log.roll_number, log.student_name)}
                    >
                      {log.student_name}
                    </td>
                    <td className="px-6 py-4 text-slate-500">{log.roll_number}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider ${log.scan_type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                        {log.scan_type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* STUDENT HISTORY VIEW */
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <button onClick={() => setActiveTab('logs')} className="text-xs bg-white border px-2 py-1 rounded hover:bg-gray-50">← Back</button>
                <h2 className="text-lg font-bold text-slate-800">Student History</h2>
              </div>
              <h3 className="text-2xl font-black text-blue-600">{selectedStudentHistory?.name}</h3>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Time</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedStudentHistory?.logs.length === 0 ? (
                  <tr><td colSpan="3" className="p-8 text-center text-slate-400">No history found.</td></tr>
                ) : selectedStudentHistory?.logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-6 py-4 font-mono text-slate-600 bg-slate-50/30">{log.date_only}</td>
                    <td className="px-6 py-4 font-mono text-slate-500">{log.scan_time}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider ${log.scan_type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                        {log.scan_type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceReports;