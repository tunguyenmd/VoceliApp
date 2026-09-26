import Link from "next/link";
import { ArrowRight, AudioLines, HeartHandshake, KeyRound, MessageCircleHeart, ScanSearch, Search, ShieldCheck, Sparkles } from "lucide-react";
import { Wordmark } from "@/components/Logo";
import { DemoLauncher } from "@/components/DemoLauncher";
import { HeroVisual } from "@/components/HeroVisual";
import { demoMode } from "@/lib/server/config";
import { getPlannerPlanId } from "@/lib/server/session";

export default async function Landing() {
  const hasPlan = !!(await getPlannerPlanId());
  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <Wordmark />
        {hasPlan && (
          <Link href="/plan" className="btn btn-quiet">
            My plan
          </Link>
        )}
      </header>

      <main className="flex-1">
        <section className="relative">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-40 h-[42rem] bg-[radial-gradient(ellipse_at_top,rgba(217,164,65,0.22),transparent_60%)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-10 lg:grid-cols-[1.15fr_1fr] lg:pt-16">
            <div>
              <p className="eyebrow mb-4">Advance care planning, in your own voice</p>
              <h1 className="font-display text-[2.8rem] leading-[1.05] sm:text-6xl">Be heard, even when you can&rsquo;t speak for yourself.</h1>
              <p className="mt-6 max-w-xl text-xl text-ink-soft">
                A gentle, guided conversation about what matters most to you. You record it in your own voice and share it with the people who may one day have to speak for you.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={hasPlan ? "/plan" : "/start"} className="btn btn-primary px-7 text-lg">
                  {hasPlan ? "Continue my plan" : "Start my plan"} <ArrowRight className="h-5 w-5" />
                </Link>
                <span className="self-center text-[0.95rem] text-ink-mute">About 15 minutes. Skip anything.</span>
              </div>
              <p className="mt-10 max-w-lg border-l-4 border-gold pl-4 text-ink-soft">
                Only about <strong className="text-ink">1 in 3</strong> U.S. adults has any advance directive. When a crisis comes, most families are left guessing.
                <span className="mt-1 block text-sm text-ink-mute">Yadav et al., Health Affairs, 2017</span>
              </p>
            </div>
            <HeroVisual />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-12">
          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                icon: MessageCircleHeart,
                title: "A guided conversation",
                text: "Five kinds of gentle questions about what matters most, quality of life, and when to stop treatment. Every question can be skipped.",
              },
              {
                icon: AudioLines,
                title: "In your own voice",
                text: "Answer each question in a minute or so of your own words, or type instead. Your family will hear it from you.",
              },
              {
                icon: HeartHandshake,
                title: "Shared with care",
                text: "Private links for the people you choose, their own consent, access you can turn off any time, and a log of who listened.",
              },
            ].map((p) => (
              <div key={p.title} className="card p-7">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sand text-clay">
                  <p.icon className="h-6 w-6" />
                </span>
                <h2 className="mt-5 font-display text-2xl">{p.title}</h2>
                <p className="mt-2 text-ink-soft">{p.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-12">
          <div className="overflow-hidden rounded-[2rem] bg-dusk p-8 text-white sm:p-12">
            <p className="flex items-center gap-2 text-[0.8rem] font-bold uppercase tracking-[0.14em] text-gold">
              <Sparkles className="h-4 w-4" /> Quietly helpful AI
            </p>
            <h2 className="mt-3 max-w-2xl font-display text-4xl leading-tight">It listens closely, and never decides for you.</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {[
                { icon: AudioLines, title: "Speak naturally", text: "Heard notices when your own words already answer a question and suggests it, quoting you. You tap to accept." },
                { icon: ScanSearch, title: "Clarity check", text: "It points out words your family might read two ways, like “don’t let me be a vegetable,” and asks what you meant." },
                { icon: Search, title: "Your family can find your words", text: "When they ask, “Would Mom want the machines?”, Heard plays the exact moment you answered, in your voice." },
              ].map((f) => (
                <div key={f.title}>
                  <f.icon className="h-6 w-6 text-gold" />
                  <h3 className="mt-3 text-lg font-bold">{f.title}</h3>
                  <p className="mt-1 text-white/75">{f.text}</p>
                </div>
              ))}
            </div>
            <p className="mt-8 text-sm text-white/60">Powered by OpenAI models on Amazon Bedrock, with retention turned off. Every AI suggestion must quote your exact words, or it is thrown away.</p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-12">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="card p-7">
              <KeyRound className="h-6 w-6 text-dusk" />
              <h2 className="mt-4 font-display text-2xl">Private by design</h2>
              <p className="mt-2 text-ink-soft">
                Encrypted with three separate keys: your answers, your voice, and how you want to hear serious news. That last one has its own access log and is never sent to AI.
              </p>
            </div>
            <div className="card p-7">
              <ShieldCheck className="h-6 w-6 text-sage" />
              <h2 className="mt-4 font-display text-2xl">Honest about what it is</h2>
              <p className="mt-2 text-ink-soft">
                Heard helps you prepare and share your values. It is not a legal document or a medical order, and it shows you how to complete your state&rsquo;s official forms.
              </p>
            </div>
          </div>
        </section>

        {demoMode() && <DemoLauncher />}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-5 py-10 text-sm text-ink-mute">
        Heard · A hackathon prototype. Not a legal document or medical order. In a crisis, call 911. If you are thinking about suicide, call or text 988.
      </footer>
    </div>
  );
}
