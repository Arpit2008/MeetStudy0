import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Us – TalkStranger.online | Random Video Chat Platform",
  description: "Learn about TalkStranger, a free platform for instant random video chat with strangers worldwide. Our mission is to connect people through simple, accessible conversations.",
  keywords: ["about TalkStranger", "random video chat platform", "talk to strangers", "free video chat", "meet strangers online"],
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-3xl">💬</span>
            <span className="text-xl font-bold bg-gradient-to-r from-sky-500 to-cyan-500 bg-clip-text text-transparent">
              TalkStranger
            </span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/" className="text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
              Home
            </Link>
            <Link href="/privacy" className="text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
              Terms
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <article className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="text-4xl font-bold text-center mb-8 bg-gradient-to-r from-sky-600 to-cyan-600 bg-clip-text text-transparent">
            About TalkStranger.online
          </h1>
          
          <section className="mb-8">
            <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
              Welcome to TalkStranger.online, a modern platform designed for people who want to talk to strangers online instantly and meet new people from around the world. Our website provides a simple and fast way to start conversations with random users without complicated steps or long registration forms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Our Mission
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Our mission is to create an easy-to-use platform where people can connect, communicate, and discover new friendships online. We believe that meaningful conversations can happen anywhere, even between strangers who have never met before. TalkStranger helps break social barriers by allowing users to connect instantly and have real-time conversations with random people worldwide.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              What Makes TalkStranger Unique
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              Unlike many other platforms, TalkStranger focuses on simplicity and speed. We want users to start chatting within seconds without unnecessary steps.
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-300">
              <li>Instant random video chat with strangers</li>
              <li>Free access without complex registration</li>
              <li>Fast and smooth user experience</li>
              <li>Ability to meet people from different countries</li>
              <li>Simple interface for easy chatting</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Safe and Responsible Communication
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              While TalkStranger allows people to talk freely, we encourage respectful communication. Users should always interact politely and responsibly with others on the platform. Our platform aims to create a positive environment where users can enjoy conversations and meet new people safely.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Start Chatting Today
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Experience the excitement of meeting new people online with TalkStranger.online. With just one click, you can begin a random video chat with strangers and start conversations with people from different countries, cultures, and backgrounds.
            </p>
          </section>

          <div className="mt-12 text-center">
            <Link 
              href="/"
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-sky-500 to-cyan-500 text-white font-semibold rounded-full hover:shadow-lg hover:shadow-sky-500/30 transition-all duration-300 transform hover:scale-105"
            >
              <span>💬</span>
              <span>Start Video Chat</span>
            </Link>
          </div>
        </article>
      </main>

      {/* Footer */}
      <footer className="bg-slate-100 dark:bg-slate-900 py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-slate-600 dark:text-slate-400">
            🔒 100% Private • No Login Required • Video Sessions • P2P Connection
          </p>
          <p className="text-slate-500 dark:text-slate-500 mt-2">
            © {new Date().getFullYear()} TalkStranger.online - All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
