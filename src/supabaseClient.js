import { createClient } from '@supabase/supabase-js';

// PASTE YOUR REAL URL HERE
const supabaseUrl = 'https://gpjmlbrtfqouqskbbjdw.supabase.co';

// PASTE YOUR REAL LONG KEY HERE
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwam1sYnJ0ZnFvdXFza2JiamR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2Njc3MDksImV4cCI6MjA4MzI0MzcwOX0.Hn3zwqwEevz8KP9chXYs9wRwwhdxYw6hrKtAgM-NZ5w'; 

export const supabase = createClient(supabaseUrl, supabaseKey);