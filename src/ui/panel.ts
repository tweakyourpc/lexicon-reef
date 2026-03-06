export class SidePanel {
  readonly root: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private openState = false;

  constructor(title: string) {
    this.root = document.createElement("div");
    this.root.style.position = "fixed";
    this.root.style.top = "0";
    this.root.style.right = "0";
    this.root.style.bottom = "0";
    this.root.style.width = "420px";
    this.root.style.background = "rgba(5, 10, 16, 0.94)";
    this.root.style.borderLeft = "1px solid rgba(162, 211, 255, 0.32)";
    this.root.style.boxShadow = "-10px 0 30px rgba(0, 0, 0, 0.3)";
    this.root.style.transform = "translateX(100%)";
    this.root.style.transition = "transform 220ms ease, opacity 220ms ease";
    this.root.style.opacity = "0.1";
    this.root.style.zIndex = "20";
    this.root.style.pointerEvents = "none";
    this.root.style.display = "flex";
    this.root.style.flexDirection = "column";

    const header = document.createElement("div");
    header.style.padding = "10px 12px";
    header.style.borderBottom = "1px solid rgba(162, 211, 255, 0.2)";
    header.style.fontFamily = '"Iosevka", "SF Mono", Menlo, Consolas, monospace';
    header.style.fontSize = "12px";
    header.style.color = "#d3edff";
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.textContent = title;

    const hint = document.createElement("span");
    hint.style.color = "rgba(184, 214, 236, 0.85)";
    hint.textContent = "T toggle, B branch";
    header.appendChild(hint);

    this.content = document.createElement("div");
    this.content.style.flex = "1";
    this.content.style.minHeight = "0";
    this.content.style.overflow = "hidden";

    this.root.appendChild(header);
    this.root.appendChild(this.content);
    document.body.appendChild(this.root);
  }

  setContent(element: HTMLElement): void {
    this.content.replaceChildren(element);
  }

  toggle(): void {
    this.setOpen(!this.openState);
  }

  setOpen(open: boolean): void {
    this.openState = open;
    if (open) {
      this.root.style.transform = "translateX(0)";
      this.root.style.opacity = "1";
      this.root.style.pointerEvents = "auto";
    } else {
      this.root.style.transform = "translateX(100%)";
      this.root.style.opacity = "0.1";
      this.root.style.pointerEvents = "none";
    }
  }

  isOpen(): boolean {
    return this.openState;
  }
}
