#import "../index.typ": template, tufted
#show: template.with(
  title: "Yu Hu — CV",
  description: "Curriculum Vitae of Yu Hu",
  lang: "en"
)

= Yu Hu (胡宇)

#tufted.margin-note[
  PhD Student \
  IntelliArchLab \
  Rice University \
  Houston, TX, USA
]

#tufted.margin-note[
  #link("mailto:yh188@rice.edu")[yh188\@rice.edu] \
  #link("https://github.com/yu44MTX")[github.com/yu44MTX]
]

#link("CV-PDF.pdf")[[PDF version]]

== Education

- *2025 -- Present.* Ph.D. in Electrical and Computer Engineering, Rice University. \
  Advisor: Prof. Tony Geng. Lab: IntelliArchLab.

== Research Interests

My research focuses on diffusion models, deep-supervised LLMs, and AI security — with a current emphasis on multi-turn jailbreak attacks against aligned language models. Concretely, I am exploring:

- *Diffusion model efficiency* — dynamic-resolution sampling and trajectory shaping for accelerated denoising.
- *Deep-supervised LLMs (DS-LLM)* — reasoning architectures with an internal orchestrator that learns where to think, rather than relying on external prompting scaffolds.
- *Multi-turn AI red-teaming* — attack frameworks against aligned language models, including approaches that use diffusion-style LLMs as the attacker.

== Selected Projects

- *DyRes* — Dynamic-resolution diffusion sampler. Investigated trajectory policies and the "quality cliff" caused by switching resolution near the end of the sampling schedule. Manuscript in revision.
- *DS-LLM* — Deep-supervised language model with an internal orchestrator. Phase 1 trains ProsQA and GSM8K-Aug on GPT-2 small as a proof of concept; the long-term goal is a DS-native model with no external scaffolding.
- *Multi-turn Jailbreak* — Studying multi-turn attack strategies (X-teaming, LARGO, STAR) against aligned chat models; exploring whether diffusion-LLM attackers can produce more effective inpaint-style adversarial dialogues.

== Publications

_In submission._

== Skills

- *Languages.* Python, C/C++, Shell, LaTeX, Typst.
- *ML stack.* PyTorch, Hugging Face Transformers, JAX.
- *Compute.* NERSC Perlmutter (project m4705).
- *Tooling.* Claude Code, Cursor, Zotero, Overleaf.
