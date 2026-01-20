import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gpjmlbrtfqouqskbbjdw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwam1sYnJ0ZnFvdXFza2JiamR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2Njc3MDksImV4cCI6MjA4MzI0MzcwOX0.Hn3zwqwEevz8KP9chXYs9wRwwhdxYw6hrKtAgM-NZ5w';

// I will read the file again to be sure I copy the exact key.

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    console.log("Testing Supabase Connection...");
    try {
        const { data, error } = await supabase.from('students').select('*').limit(5);
        if (error) {
            console.error("Error fetching students:", error.message);
            console.error("Details:", error);
        } else {
            console.log("Success! Found " + data.length + " students.");
            if (data.length > 0) {
                console.log("Sample student:", data[0]);
            } else {
                console.log("Table is empty.");
            }
        }
    } catch (err) {
        console.error("Unexpected error:", err);
    }
}

testConnection();

