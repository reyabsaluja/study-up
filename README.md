<div align="center">
  <img alt="Logo" src="studyup-logo.svg" width="100" />
  <h1><strong>StudyUp</strong></h1>
  <p>All-in-one AI-powered academic workspace that organizes your semester generates personalized study plans using full context.</p>
</div>

---

https://github.com/user-attachments/assets/6e5bc6b9-fa0c-423a-b1d9-c652b3b69478

## 🚀 How It Works

1. **Organize**: Create and manage courses, assignments, notes, and materials
2. **Study**: Generate AI-powered study plans and summaries tailored to your needs
3. **Track**: Monitor progress and past activity with a built-in dashboard
4. **Summarize**: Use the AI tutor to condense lengthy notes into key points
5. **Upload**: Securely upload and manage course materials

---

## 🔧 Features

- 📚 Course & assignment management with autosave notes
- 🤖 AI Tutor powered by Gemini via Supabase Edge Functions
- 📊 Visual analytics using Recharts and date-fns
- 📁 File uploads secured with Supabase Storage policies
- 🔒 Auth via Supabase with RLS and user-specific data access
- 📝 Smart note editor with tagging and AI-generated summaries
- 📆 Study session tracking and activity logging
- 🧠 Gemini-based chat + study-plan generation (via Deno Edge Functions)

---

## 🛠️ Architecture

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router
- **State & Forms**: React Query, React Hook Form, Zod
- **Backend**: Supabase PostgreSQL with migrations & RLS policies
- **Functions**: Supabase Edge Functions for chat and AI plan generation
- **Libraries**: Recharts, Sonner, Embla, Lucide, pdfjs-dist, clsx, class-variance-authority

---

## ⚡ Quick Start

### Prerequisites

- Node.js 18+
- Supabase project
- Gemini API key

### Setup

```bash
npm install
```

Create a .env file with:

```bash
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
GEMINI_API_KEY=<your-gemini-key>
```

Start the development server:

```bash
npm run dev
```

Visit: http://localhost:8080 

Supabase Setup
1. Run all SQL files in supabase/migrations/ to initialize the database schema
2. Deploy edge functions in supabase/functions/ using the Supabase CLI:

```bash
supabase functions deploy chat-with-gemini
supabase functions deploy generate-study-plan
```

#### Deployed @ [https://study-up.lovable.app/)

## 🌐 Browser Compatibility

Supported on:
- Chrome 90+  
- Firefox 88+  
- Safari 14+  
- Edge 90+

---

## 📄 License

MIT License
