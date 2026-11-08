// Machine login. One mod, three roles (by props):
//  - watcher (no props; put it in a layout, floating, it draws nothing): every 5 s asks `hc machine ls`;
//    when a machine's state becomes "needs_login" it opens the dialog once (until the state changes).
//  - dialog (props.overlay, no props.bar; also `mod.open machine-login`): "naoto-wsl needs a password",
//    [Log in] starts `hc machine login <name>` in a terminal and shows it in a popup;
//    the password is typed into that terminal (ssh reads it from its tty), never through this mod.
//  - bar (props.bar): title bar above the terminal, ✕ closes and ends the terminal.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { hc, run, openOverlay, closeOverlay, props, theme, notify } from "herdr";

async function needLogin() {
  const r = await hc(["machine", "ls", "--json"]);
  if (r.code !== 0) return [];
  return (JSON.parse(r.stdout).machines ?? []).filter((m) => m.state === "needs_login" && !m.temporary).map((m) => m.name);
}

function openDialog(machine) {
  return openOverlay({ mod: "machine-login", kind: "dialog", width: 460, height: 190, modal: true, props: { machine } });
}

export default class MachineLogin extends View {
  init(_p, cx) {
    const p = props() ?? {};
    this.mode = p.bar ? "bar" : p.overlay ? "dialog" : "watcher";
    if (this.mode === "watcher") {
      this.asked = new Set();
      this.tick(cx);
      cx.timer.every(5000, (cx) => this.tick(cx));
    } else if (this.mode === "dialog" && !p.machine) {
      cx.spawn(async (cx) => { this.machine = (await needLogin())[0] ?? null; this.loaded = true; cx.notify(); });
    }
  }

  tick(cx) {
    cx.spawn(async () => {
      let now;
      try { now = new Set(await needLogin()); } catch { return; }
      for (const m of this.asked) if (!now.has(m)) this.asked.delete(m); // logged in (or gone): ask again next time
      for (const m of now) if (!this.asked.has(m)) { this.asked.add(m); openDialog(m); }
    });
  }

  login(machine, cx) {
    if (this.busy) return;
    this.busy = true; this.error = null; cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["run", "--json", "--bg", "--no-parent", "--rm", "--name", `login-${machine}`.slice(0, 32), "--", "hc", "machine", "login", machine]);
        const out = JSON.parse(r.stdout || "{}");
        const address = out.address ?? out.terminal ?? out.id;
        if (r.code !== 0 || !address) throw new Error((r.stderr || r.stdout).trim() || "could not start the login terminal");
        const me = props().overlay;
        openOverlay({
          kind: "dialog", modal: true, width: 640, height: 340,
          layout: { type: "column", children: [
            { type: "block", size: { px: 34 }, content: { mod: "machine-login", props: { bar: true, machine, terminal: address } } },
            { type: "block", content: { terminal: address } },
          ] },
        });
        closeOverlay(me);
      } catch (e) { this.error = String(e.message ?? e); this.busy = false; cx.notify(); }
    });
  }

  render(cx) {
    const t = theme();
    const p = props() ?? {};
    if (this.mode === "watcher") return div();
    if (this.mode === "bar") {
      return h_flex().size_full().px(12).gap(8).items_center().bg(t.surface).border_b(1).border_color(t.border).text_size(12)
        .child(div().flex_1().truncate().font_semibold().text_color(t.foreground).child(`${p.machine}: type the password below`))
        .child(div().id("close").px(8).py(2).rounded(5).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => { hc(["kill", p.terminal]).catch(() => {}); closeOverlay(p.overlay); }).child("✕"));
    }
    const machine = p.machine ?? this.machine;
    const btn = (id, label, primary, fn) => div().id(id).px(14).h(32).flex().items_center().rounded(7).cursor_pointer()
      .when(primary, (el) => el.bg(t.solid).text_color(t.solid_foreground).font_semibold())
      .when(!primary, (el) => el.text_color(t.muted).hover((s) => s.bg(t.hover)))
      .on_click(fn).child(label);
    return v_flex().size_full().p(20).gap(12).bg(t.popover).text_size(13)
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child(machine ? `${machine} に再ログインが必要です` : p.machine === undefined && !this.loaded ? "…" : "ログインが必要なマシンはありません"))
      .child(div().text_color(t.muted).child(machine ? "「ログイン」を押すと小さな端末が開きます。そこにパスワード(またはコード)を入力してください。" : "接続は正常です。"))
      .when(Boolean(this.error), (el) => el.child(div().text_color(t.blocked).text_size(12).child(this.error)))
      .child(div().flex_1())
      .child(h_flex().gap(8).justify_end()
        .child(btn("later", "あとで", false, () => closeOverlay(p.overlay)))
        .when(Boolean(machine), (el) => el.child(btn("go", this.busy ? "…" : "ログイン", true, (_e, cx) => this.login(machine, cx)))));
  }
}
