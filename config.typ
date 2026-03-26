#import "tufted-lib/tufted.typ" as tufted

/// 在 `config.typ` 中配置全局模板配置 template
/// 之后的每个页面都会从上个页面导入这个模板函数
/// 在每个具体页面中，都可以通过 `#show: template` 来应用模板
/// 也可以通过 `template.with(...)` 来覆盖某些配置项，从而为某个页面定制参数
#let template = tufted.tufted-web.with(
  /// 网站顶部导航栏的链接字典。格式为 `("链接地址": "显示名称")`。
  // 例如，如果你想添加一个 Entry 页，你需要添加 `"/Entry/": "Entry"`
  // 然后在 `content/` 路径中新建 `Entry/`路径，在其中添加 `index.typ` 作为 Entry 页的内容
  header-links: (
    "/": "Home",
    "/Blog/": "Blog",
    "/CV/": "CV",
  ),

  website-title: "Nsn_Yu",
  author: "Yu Hu",
  description: "Echoes of My Mind — Dream without fear, love without limits",
  website-url: "https://yu44MTX.github.io/",
  lang: "zh",
  feed-dir: ("/Blog/",),

  header-elements: (
    [Echoes of My Mind],
    [Dream without fear, love without limits],
  ),
  footer-elements: (
    "© 2026 Yu Hu",
    [Powered by #link("https://github.com/Yousa-Mirage/Tufted-Blog-Template")[Tufted-Blog-Template]],
  ),
)

// 更多参数可参考网站配置文档。