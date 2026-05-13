import { ArrowRight, Gauge, HardDrive, LockKeyhole, ShieldCheck, Zap } from "lucide-react";
import { MantisMark, MantisMascot } from "@/components/mantisvault/MantisMark";
import { Button } from "@/components/ui/Button";

const benefits = [
  { label: "Local-first", icon: HardDrive },
  { label: "Criptografado", icon: LockKeyhole },
  { label: "Sem perda", icon: ShieldCheck },
  { label: "Ultrarrápido", icon: Zap }
];

export default function WelcomePage() {
  return (
    <main className="hero-page">
      <section className="hero-frame">
        <div className="hero-copy">
          <span className="brand">
            <span className="brand-mark">
              <MantisMark />
            </span>
            <span>
              <span className="brand-word">
                Mantis<span>Vault</span>
              </span>
              <span className="brand-sub">Local-first secure vault</span>
            </span>
          </span>

          <div>
            <h1>
              Mantis<span>Vault</span>
            </h1>
            <p className="tagline">Compress. Encrypt. Send.</p>
          </div>

          <p>
            Seu cofre local-first para otimizar, proteger e enviar arquivos com privacidade por design.
          </p>

          <div className="benefits">
            {benefits.map((benefit) => {
              const Icon = benefit.icon;

              return (
                <div className="benefit" key={benefit.label}>
                  <Icon size={22} />
                  <strong>{benefit.label}</strong>
                </div>
              );
            })}
          </div>

          <div className="hero-actions">
            <Button href="/connect" size="lg">
              Começar agora
              <ArrowRight size={18} />
            </Button>
            <Button href="/dashboard" variant="ghost" size="lg">
              Saiba mais
              <Gauge size={18} />
            </Button>
          </div>
        </div>

        <div className="hero-visual">
          <div className="mantis-visual">
            <MantisMascot />
          </div>
        </div>

        <div className="tech-rail">
          <span>LOCAL-FIRST</span>
          <span>CRIPTOGRAFADO</span>
          <span>SOB SEU CONTROLE</span>
        </div>
      </section>
    </main>
  );
}
