export class WelcomeOverlay {
  private readonly root: HTMLDivElement;
  private dismissed = false;

  constructor() {
    this.root = document.createElement("div");
    this.root.style.position = "fixed";
    this.root.style.inset = "0";
    this.root.style.zIndex = "40";
    this.root.style.display = "flex";
    this.root.style.alignItems = "center";
    this.root.style.justifyContent = "center";
    this.root.style.padding = "24px";
    this.root.style.background = "rgba(3, 6, 12, 0.74)";
    this.root.style.backdropFilter = "blur(2px)";

    const card = document.createElement("div");
    card.style.maxWidth = "760px";
    card.style.width = "100%";
    card.style.background = "rgba(7, 12, 19, 0.96)";
    card.style.border = "1px solid rgba(162, 211, 255, 0.34)";
    card.style.borderRadius = "12px";
    card.style.boxShadow = "0 14px 36px rgba(0, 0, 0, 0.42)";
    card.style.padding = "22px 24px";
    card.style.fontFamily = '"Iosevka", "SF Mono", Menlo, Consolas, monospace';
    card.style.color = "#d3edff";
    card.style.lineHeight = "1.5";

    const title = document.createElement("div");
    title.textContent = "Lexicon Reef";
    title.style.fontSize = "18px";
    title.style.marginBottom = "8px";

    const body = document.createElement("p");
    body.textContent =
      "Lexicon Reef is a browser-native simulation-art game where glyphs drift, trade energy, bond, and fork into dialects. You are not steering a character; you are perturbing an ecology, then reading the consequences over time. Auto Nurture is enabled by default to keep new runs from collapsing immediately, and you can toggle it at any time. Advanced tools start OFF so play controls stay front-and-center.";
    body.style.margin = "0 0 12px 0";
    body.style.color = "rgba(197, 223, 244, 0.95)";
    body.style.fontSize = "13px";

    const controls = document.createElement("div");
    controls.style.fontSize = "12px";
    controls.style.color = "rgba(184, 214, 236, 0.92)";
    controls.innerHTML = [
      "<div>Keys: <strong>A</strong> Auto Nurture, <strong>P</strong> Pause/Resume, <strong>X</strong> Stop/Restart, <strong>H</strong> detailed HUD.</div>",
      "<div>Buttons: Food Burst (+energy in a radius), Glyph Bias (prefer one glyph for 200 ticks), Bond Storm (10x bond chance for 150 ticks).</div>",
      "<div>Export Run downloads a JSON artifact. Use <strong>Advanced: ON</strong> to enable Save/Load and hotkeys <strong>T</strong> timeline + <strong>B</strong> branch.</div>",
      "<div style=\"margin-top:10px;color:#e9c46a;\">Click or press any key to begin.</div>"
    ].join("");

    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(controls);
    this.root.appendChild(card);
  }

  show(): void {
    if (this.dismissed) {
      return;
    }
    document.body.appendChild(this.root);
    window.addEventListener("pointerdown", this.handleDismiss, { capture: true });
    window.addEventListener("keydown", this.handleDismiss, { capture: true });
  }

  private readonly handleDismiss = (event: Event): void => {
    if (this.dismissed) {
      return;
    }
    this.dismissed = true;
    event.preventDefault();
    event.stopPropagation();
    this.root.remove();
    window.removeEventListener("pointerdown", this.handleDismiss, { capture: true });
    window.removeEventListener("keydown", this.handleDismiss, { capture: true });
  };
}
