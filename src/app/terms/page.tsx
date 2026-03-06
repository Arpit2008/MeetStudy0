import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms and Conditions – TalkStranger.online",
  description: "TalkStranger terms and conditions. Learn the rules and guidelines for using our random video chat platform responsibly.",
  keywords: ["terms and conditions", "TalkStranger terms", "user guidelines", "video chat rules", "community guidelines"],
};

export default function TermsPage() {
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
            <Link href="/privacy" className="text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400 transition-colors">
              Privacy
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        <article className="prose prose-slate dark:prose-invert max-w-none">
          <h1 className="text-4xl font-bold text-center mb-8 bg-gradient-to-r from-sky-600 to-cyan-600 bg-clip-text text-transparent">
            Terms and Conditions
          </h1>
          
          <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed mb-8">
            By accessing and using TalkStranger.online, you agree to follow the rules and guidelines of the platform.
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Platform Purpose
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              TalkStranger is designed as an online communication platform that allows users to connect with strangers through chat or video conversations. The platform is intended for entertainment and communication purposes only.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              User Conduct
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              Users must behave respectfully toward others. The following behaviors are strictly prohibited:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-300">
              <li>Harassment or bullying of any kind</li>
              <li>Abusive language or offensive content</li>
              <li>Threats or violence toward others</li>
              <li>Sharing explicit or inappropriate content</li>
              <li>Spamming or excessive self-promotion</li>
              <li>Impersonating others</li>
              <li>Illegal activities or behavior</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Age Restrictions
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              TalkStranger is intended for users who are at least 18 years of age. By using this platform, you confirm that you are of legal age to use this service in your jurisdiction.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              User Responsibility
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Users are responsible for their own actions while interacting with others on the platform. Please exercise caution and common sense when engaging in conversations with strangers online.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Privacy and Safety Tips
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
              We recommend following these safety guidelines:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-300">
              <li>Do not share personal information such as your full name, address, phone number, or email</li>
              <li>Do not share financial information or passwords</li>
              <li>Be cautious about sharing photos or videos</li>
              <li>Report any suspicious or inappropriate behavior</li>
              <li>End conversations that make you uncomfortable</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Platform Moderation
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              TalkStranger reserves the right to restrict or block users who violate platform rules or create an unsafe environment for others. We may take the following actions:
            </p>
            <ul className="list-disc list-inside space-y-2 text-slate-600 dark:text-slate-300 mt-4">
              <li>Issue warnings to users</li>
              <li>Temporarily suspend accounts</li>
              <li>Permanently ban users who repeatedly violate rules</li>
              <li>Report illegal activities to appropriate authorities</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Disclaimer
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              TalkStranger is provided &quot;as is&quot; without any warranties of any kind. We cannot guarantee the behavior of other users or the accuracy of information shared on the platform. Users engage with strangers at their own risk.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Changes to Terms
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              We reserve the right to modify these terms and conditions at any time. Continued use of TalkStranger.online after changes are posted constitutes acceptance of the modified terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-200 mb-4">
              Contact Information
            </h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              If you have any questions about these Terms and Conditions, please contact us at: <strong>arpitmaurya55555@gmail.com</strong>
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
