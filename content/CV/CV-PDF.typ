// PDF version of Yu Hu's CV.
// Files whose name contains "PDF" are auto-compiled to a standalone PDF (CV-PDF.pdf),
// which the web CV links to. Per the template rule, do NOT use `#show: template` or
// any `tufted` commands here — the PDF styling is controlled independently below.

#set document(title: "Yu Hu — Curriculum Vitae", author: "Yu Hu")
#set page(paper: "a4", margin: (x: 1.9cm, top: 1.8cm, bottom: 1.8cm))
#set text(size: 10.5pt)
#set par(justify: true, leading: 0.62em)
#show link: it => underline(it)

// Section headings: bold + a thin rule underneath.
#show heading.where(level: 1): it => block(above: 1.15em, below: 0.65em)[
  #text(size: 1.05em, weight: "bold", upper(it.body))
  #v(-0.45em)
  #line(length: 100%, stroke: 0.5pt)
]

// ── Header ──────────────────────────────────────────────
#block[
  #text(size: 1.9em, weight: "bold")[Yu Hu #h(0.2em) #text(size: 0.6em, weight: "regular")[(胡宇)]]
  #v(0.35em)
  PhD Student · IntelliArchLab · Rice University · Houston, TX, USA
  #v(0.15em)
  #link("mailto:yh188@rice.edu")[yh188\@rice.edu]
  #h(1.2em) #link("https://github.com/yu44MTX")[github.com/yu44MTX]
  #h(1.2em) #link("https://yuhu-ai.top")[yuhu-ai.top]
]

#v(0.4em)

= Education

- *2025 -- Present.* Ph.D. in Electrical and Computer Engineering, Rice University. \
  Advisor: Prof. Tony Geng. Lab: IntelliArchLab.

- *2021 -- 2025.* B.Eng. in Information Security, Huazhong University of Science and
  Technology (HUST), Wuhan, China.

= Research Interests

My research focuses on diffusion models, deep-supervised LLMs, and AI security — with a
current emphasis on multi-turn jailbreak attacks against aligned language models.
Concretely, I am exploring:

- *Diffusion model efficiency* — dynamic-resolution sampling and trajectory shaping for
  accelerated denoising.
- *Deep-supervised LLMs (DS-LLM)* — reasoning architectures with an internal orchestrator
  that learns where to think, rather than relying on external prompting scaffolds.
- *Multi-turn AI red-teaming* — attack frameworks against aligned language models,
  including approaches that use diffusion-style LLMs as the attacker.

= Selected Projects

- *DyRes* — Dynamic-resolution diffusion sampler. Investigated trajectory policies and the
  "quality cliff" caused by switching resolution near the end of the sampling schedule.
  Manuscript in revision.
- *DS-LLM* — Deep-supervised language model with an internal orchestrator. Phase 1 trains
  ProsQA and GSM8K-Aug on GPT-2 small as a proof of concept; the long-term goal is a
  DS-native model with no external scaffolding.
- *Multi-turn Jailbreak* — Studying multi-turn attack strategies (X-teaming, LARGO, STAR)
  against aligned chat models; exploring whether diffusion-LLM attackers can produce more
  effective inpaint-style adversarial dialogues.

= Publications

_In submission._

= Skills

- *Languages.* Python, C/C++, Shell, LaTeX, Typst.
- *ML stack.* PyTorch, Hugging Face Transformers, JAX.
- *Compute.* NERSC Perlmutter (project m4705).
- *Tooling.* Claude Code, Cursor, Zotero, Overleaf.
