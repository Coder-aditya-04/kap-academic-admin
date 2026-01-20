import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Users,
  UserCheck,
  UserX,
  ScanLine,
  BarChart,
  TrendingUp,
  Calendar,
  Clock,
  Activity,
  Target,
  Zap,
  Shield,
  Loader
} from 'lucide-react';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalStudents: 0,
    enrolledStudents: 0,
    todayPresent: 0,
    todayAbsent: 0,
    totalScans: 0,
    attendanceRate: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Get student stats
      const { data: students } = await supabase.from('students').select('*');
      const enrolledCount = students?.filter(s => s.face_descriptor).length || 0;

      // Get today's attendance
      const { data: todayLogs } = await supabase
        .from('gate_logs')
        .select('roll_number, scan_type')
        .eq('date_only', today);

      const presentToday = new Set(todayLogs?.filter(log => log.scan_type === 'IN').map(log => log.roll_number)).size;
      const absentToday = (students?.length || 0) - presentToday;

      // Get total scans
      const { count: totalScans } = await supabase
        .from('gate_logs')
        .select('*', { count: 'exact', head: true });

      // Get recent activity
      const { data: recentLogs } = await supabase
        .from('gate_logs')
        .select('student_name, scan_type, scan_time, roll_number')
        .order('scan_time', { ascending: false })
        .limit(5);

      // Calculate attendance rate
      const totalPossible = students?.length || 1;
      const attendanceRate = totalPossible > 0 ? Math.round((presentToday / totalPossible) * 100) : 0;

      setStats({
        totalStudents: students?.length || 0,
        enrolledStudents: enrolledCount,
        todayPresent: presentToday,
        todayAbsent: absentToday,
        totalScans: totalScans || 0,
        attendanceRate
      });

      setRecentActivity(recentLogs || []);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ icon: Icon, title, value, subtitle, color, bgColor }) => (
    <div className={`bg-white rounded-2xl p-6 shadow-lg border border-slate-200 hover:shadow-xl transition-all duration-200 ring-1 ring-slate-100/50 ${bgColor}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-600 text-sm font-bold uppercase tracking-wider mb-2">{title}</p>
          <p className="text-3xl font-black text-slate-800">{value}</p>
          {subtitle && <p className="text-slate-500 text-sm mt-1">{subtitle}</p>}
        </div>
        <div className={`p-4 rounded-2xl ${color}`}>
          <Icon className="w-8 h-8 text-white" />
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
          Dashboard Overview
        </h1>
        <p className="text-slate-600 mt-2">Welcome back! Here's what's happening today.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={Users}
          title="Total Students"
          value={stats.totalStudents}
          subtitle="Registered in system"
          color="bg-gradient-to-r from-blue-500 to-blue-600"
        />
        <StatCard
          icon={UserCheck}
          title="Face Enrolled"
          value={stats.enrolledStudents}
          subtitle={`${stats.totalStudents > 0 ? Math.round((stats.enrolledStudents / stats.totalStudents) * 100) : 0}% completion`}
          color="bg-gradient-to-r from-green-500 to-emerald-600"
        />
        <StatCard
          icon={ScanLine}
          title="Today's Present"
          value={stats.todayPresent}
          subtitle={`${stats.attendanceRate}% attendance rate`}
          color="bg-gradient-to-r from-indigo-500 to-purple-600"
        />
        <StatCard
          icon={BarChart}
          title="Total Scans"
          value={stats.totalScans}
          subtitle="All time records"
          color="bg-gradient-to-r from-orange-500 to-red-600"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Quick Actions */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 ring-1 ring-slate-100/50">
          <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Zap className="w-5 h-5 text-indigo-600" />
            Quick Actions
          </h3>
          <div className="space-y-3">
            <button className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 rounded-xl font-bold hover:shadow-lg transition-all duration-200 flex items-center gap-3 hover:scale-105">
              <ScanLine className="w-5 h-5" />
              Open Smart Gate
            </button>
            <button className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white p-4 rounded-xl font-bold hover:shadow-lg transition-all duration-200 flex items-center gap-3 hover:scale-105">
              <UserCheck className="w-5 h-5" />
              Start Face Enrollment
            </button>
            <button className="w-full bg-gradient-to-r from-orange-500 to-red-600 text-white p-4 rounded-xl font-bold hover:shadow-lg transition-all duration-200 flex items-center gap-3 hover:scale-105">
              <BarChart className="w-5 h-5" />
              View Reports
            </button>
          </div>
        </div>

        {/* System Status */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 ring-1 ring-slate-100/50">
          <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-600" />
            System Status
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-medium">AI Models</span>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-600 text-sm font-bold">Active</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-medium">Database</span>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-600 text-sm font-bold">Connected</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-medium">Face Recognition</span>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-green-600 text-sm font-bold">Ready</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-medium">Camera Feed</span>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                <span className="text-yellow-600 text-sm font-bold">Standby</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 ring-1 ring-slate-100/50">
          <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600" />
            Recent Activity
          </h3>
          <div className="space-y-4">
            {recentActivity.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No recent activity</p>
            ) : (
              recentActivity.map((log, index) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className={`p-2 rounded-lg ${
                    log.scan_type === 'IN' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                  }`}>
                    {log.scan_type === 'IN' ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-800 text-sm">{log.student_name}</p>
                    <p className="text-slate-500 text-xs">{log.roll_number}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-600 text-xs">
                      {new Date(log.scan_time).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Attendance Overview Chart Placeholder */}
      <div className="mt-8 bg-white rounded-2xl p-6 shadow-lg border border-slate-200 ring-1 ring-slate-100/50">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            Weekly Attendance Trend
          </h3>
          <div className="text-sm text-slate-500">Last 7 days</div>
        </div>
        <div className="h-64 flex items-center justify-center bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl">
          <div className="text-center">
            <BarChart className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Chart visualization coming soon</p>
            <p className="text-slate-400 text-sm mt-1">Real-time attendance analytics</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
