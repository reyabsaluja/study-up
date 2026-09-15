<div align="center">
  <img alt="StudyUp brain logo" src="public/studyup-logo.svg" width="100" />
  <h1>StudyUp</h1>
  <p>Your courses, materials, plans, and AI tutor in one place.</p>
  <p>Live at <a href="https://study-up-pi.vercel.app/">study-up-pi.vercel.app</a></p>
</div>

StudyUp is an AI-powered learning companion built for university students. It
turns scattered notes, PDFs, assignments, and study plans into one organized
workspace with support grounded in each student's own course material.

![StudyUp dashboard](public/studyup-dashboard.png)

## What you can do

- Organize courses, assignments, notes, and uploaded materials
- Track deadlines, progress, and study sessions
- Build study plans around upcoming assignments
- Ask an AI tutor questions using relevant course context
- Generate concise summaries from your notes
- Keep each account's academic data and files private

## Why StudyUp

Students often study across disconnected tools: course portals, cloud drives,
calendars, notebooks, and generic AI chats. StudyUp brings that work together so
students spend less time organizing and more time learning.

## Run it locally

Use Node 22.22.2 and pnpm 12.4.1:

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

Add your Supabase URL and publishable key to `.env.local`. Detailed setup,
testing, security, and deployment instructions are in [`docs`](docs/).

## License

StudyUp is available under the [MIT License](LICENSE).

## Hackathon

StudyUp won the **Lovable x Roam International Hackathon**, hosted by UTMIST.

Our team found the idea at the Myhal Centre for Engineering Innovation and
Entrepreneurship by reflecting on our own late nights and fragmented study
workflows. With less than four hours remaining, we committed to building a
single place where students could organize their academic life and receive
personalized help from Gemini.

We built and pitched StudyUp to a panel of industry judges, winning the overall
hackathon. The experience reinforced what the project represents: practical
technology, built under pressure, focused on helping people solve a real
everyday problem.
