import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Plus, Edit, Trash2, Users, Search, UserCheck, UserX, Phone, Mail, Calendar, Loader, Save, X } from 'lucide-react';

const StudentManager = () => {
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [formData, setFormData] = useState({
    full_name: '',
    roll_number: '',
    phone: '',
    email: '',
    batch: '',
    face_descriptor: null
  });

  // Load students
  useEffect(() => {
    loadStudents();
  }, []);

  // Filter students based on search
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredStudents(students);
    } else {
      const filtered = students.filter(student =>
        student.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.roll_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.batch.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredStudents(filtered);
    }
  }, [students, searchTerm]);

  const loadStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .order('id', { ascending: false });

      if (error) throw error;
      setStudents(data || []);
    } catch (error) {
      console.error('Error loading students:', error);
      alert('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingStudent) {
        // Update existing student
        const { error } = await supabase
          .from('students')
          .update(formData)
          .eq('id', editingStudent.id);

        if (error) throw error;
      } else {
        // Create new student
        const { error } = await supabase
          .from('students')
          .insert([formData]);

        if (error) throw error;
      }

      await loadStudents();
      setShowModal(false);
      setEditingStudent(null);
      resetForm();
    } catch (error) {
      console.error('Error saving student:', error);
      alert('Failed to save student: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (student) => {
    setEditingStudent(student);
    setFormData({
      full_name: student.full_name,
      roll_number: student.roll_number,
      phone: student.phone || '',
      email: student.email || '',
      batch: student.batch || '',
      face_descriptor: student.face_descriptor
    });
    setShowModal(true);
  };

  const handleDelete = async (student) => {
    if (!confirm(`Are you sure you want to delete ${student.full_name}?`)) return;

    try {
      // 1. Delete associated logs first (Foreign Key Constraint Fix)
      const { error: logError } = await supabase
        .from('gate_logs')
        .delete()
        .eq('roll_number', student.roll_number);

      if (logError) {
        console.error('Error removing logs:', logError);
        // Continue to try deleting student even if logs fail (in case none exist), 
        // but warn console.
      }

      // 2. Delete the student
      const { error } = await supabase
        .from('students')
        .delete()
        .eq('id', student.id);

      if (error) throw error;
      await loadStudents();
    } catch (error) {
      console.error('Error deleting student:', error);
      alert('Failed to delete student: ' + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      full_name: '',
      roll_number: '',
      phone: '',
      email: '',
      batch: '',
      face_descriptor: null
    });
  };

  const enrolledCount = students.filter(s => s.face_descriptor).length;
  const totalCount = students.length;

  if (loading && students.length === 0) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader className="w-12 h-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">Loading students...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex flex-col lg:flex-row lg:justify-between lg:items-end gap-6">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent filter drop-shadow-sm">
            Student Management
          </h1>
          <p className="text-slate-600 mt-2">Manage student records and enrollment status</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          {/* Stats Cards */}
          <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-3 rounded-xl">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{totalCount}</p>
                <p className="text-sm text-slate-500">Total Students</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-3 rounded-xl">
                <UserCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{enrolledCount}</p>
                <p className="text-sm text-slate-500">Face Enrolled</p>
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              setEditingStudent(null);
              resetForm();
              setShowModal(true);
            }}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2 hover:scale-105"
          >
            <Plus className="w-5 h-5" />
            Add Student
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 mb-8">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by name, roll number, or batch..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* Students Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredStudents.map((student) => (
          <div key={student.id} className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 hover:shadow-xl transition-all duration-200 group">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white ${student.face_descriptor
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600'
                  : 'bg-gradient-to-r from-slate-400 to-slate-500'
                  }`}>
                  {student.face_descriptor ? (
                    <UserCheck className="w-6 h-6" />
                  ) : (
                    <UserX className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-800">{student.full_name}</h3>
                  <p className="text-sm text-slate-500">Roll: {student.roll_number}</p>
                </div>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                <button
                  onClick={() => handleEdit(student)}
                  className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(student)}
                  className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-slate-400" />
                <span className="text-slate-600">{student.email || 'No email'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-slate-400" />
                <span className="text-slate-600">{student.phone || 'No phone'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-slate-600">{student.batch || 'No batch'}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${student.face_descriptor
                ? 'bg-green-100 text-green-800'
                : 'bg-yellow-100 text-yellow-800'
                }`}>
                {student.face_descriptor ? (
                  <>
                    <UserCheck className="w-3 h-3" />
                    Face Enrolled
                  </>
                ) : (
                  <>
                    <UserX className="w-3 h-3" />
                    Not Enrolled
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredStudents.length === 0 && !loading && (
        <div className="text-center py-16">
          <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-600 mb-2">No students found</h3>
          <p className="text-slate-500">
            {searchTerm ? 'Try adjusting your search terms' : 'Add your first student to get started'}
          </p>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800">
                  {editingStudent ? 'Edit Student' : 'Add New Student'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Full Name *</label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="Enter full name"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Roll Number *</label>
                <input
                  type="text"
                  required
                  value={formData.roll_number}
                  onChange={(e) => setFormData({ ...formData, roll_number: e.target.value })}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="Enter roll number"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="Enter phone number"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="Enter email address"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Batch</label>
                <input
                  type="text"
                  value={formData.batch}
                  onChange={(e) => setFormData({ ...formData, batch: e.target.value })}
                  className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="Enter batch/class"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl font-bold hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
                >
                  {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {editingStudent ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentManager;