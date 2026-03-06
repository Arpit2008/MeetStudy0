import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy – TalkStranger.online",
  description: "TalkStranger privacy policy explains how we protect your privacy when using our random video chat platform. Learn what data we collect and how we use it.",
  keywords: ["privacy policy", "TalkStranger privacy", "data protection", "random chat privacy", "video chat privacy"],
};

export default function PrivacyPage() {
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
            <Link href="/about" className="text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
              About
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
            Privacy Policy
          </h1>
          
          <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed mb-8">
            At TalkStranger.online, protecting the privacy of our users is important to us. This privacy policy explains how information may be collected and used while using our platform.
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Information We Collect
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              TalkStranger allows users to start chatting without mandatory registration. Because of this, we do not collect personal account information such as usernames, passwords, or personal profiles.
            </p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-4">
              However, certain technical information may be collected automatically to improve the functionality of the website. This may include:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-300 mt-4">
              <li>Browser type and version</li>
              <li>Device type (desktop, mobile, tablet)</li>
              <li>General geographic location (country/region level)</li>
              <li>Operating system information</li>
              <li>Access times and referring URLs</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              How We Use Your Information
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              These details help us understand how users interact with the platform so we can improve the experience. The information collected is used solely for:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-300 mt-4">
              <li>Analyzing website traffic and usage patterns</li>
              <li>Improving our services and user experience</li>
              <li>Troubleshooting technical issues</li>
              <li>Maintaining platform security</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Cookies and Similar Technologies
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              TalkStranger may also use cookies or similar technologies to enhance site performance and ensure smoother browsing. Cookies are small text files stored on your device that help remember your preferences and analyze how you use the website.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Third-Party Disclosure
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              We do not sell or share personal user information with third parties. Our goal is to maintain a safe and simple environment where users can communicate freely.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              P2P Connection & Data Protection
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              TalkStranger uses peer-to-peer (P2P) technology for video chat connections. This means video and audio data is transmitted directly between users without going through our servers. This provides an additional layer of privacy as we do not store or have access to the content of your conversations.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Your Consent
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              By using TalkStranger.online, users agree to the collection of basic technical information required to operate and improve the platform.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Contact Us
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              If you have any questions about this Privacy Policy, please contact us at: <strong>arpitmaurya55555@gmail.com</strong>
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
