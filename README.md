# プラとモコのPlusエディター案内

Scratchユーザー向けに、TurboWarp Plus Editorの操作を読んで試せるガイドです。作者は Hiroya Kubo です。日英の機能ガイド14章と、プラとモコのインタラクティブ紙芝居1作品を管理します。紙芝居の7分野・56章は一つのSB3に収録しています。

## 読む・試す

- [日本語の機能ガイド](docs/features/index.html) · [English feature guide](docs/features/index.en.html)
- [紙芝居の全56章](docs/work/plus-library-index.html) · [紙芝居のSB3](docs/work/plus-library-4.0.sb3)
- [機能索引と利用条件](docs/features/feature-map/index.html)

ガイドをブラウザーで読むには、Node.js 24以上で `npm run preview` を実行し、http://127.0.0.1:8795/features/ を開きます。配布物をそのまま読むだけなら、依存のインストールは不要です。

紙芝居を試すには、SB3をTurboWarp Plus Editorの「ファイル」→「SB3ファイルを開く…」で開きます。実行画面の引出しを表示して緑の旗を押し、分野または「はじめての8章」を選びます。会話中はステージにフォーカスを戻してSpaceで進めます。各章は練習を含めて1〜3分が目安です。

[Plus Editorを開く](https://kubohiroya.github.io/turbowarp-plus-editor/editor.html?lang=ja)

## 編集・再生成

操作名、条件、画像は `docs/features/` で更新します。紙芝居の題名・セリフ・練習と対応するガイドの節は `story/plus-library-chapters.txt` にあります。 `story/plus-library.k4.yml` と背景は生成物です。

```sh
npm ci --ignore-scripts
npm run prepare:app
npm run build
```

`prepare:app` は固定した公式AppベースのサイズとSHA-256を照合します。 `build` は公式App 4.0.21のbuilderを使って `docs/work/` にSB3、章の索引、生成記録を出力します。作品で使うGuideは対応Editorの組み込み機能です。

配布SB3は、公開Editorのコミット `25655d4` で全56章の遷移を確認したSB3と同じです。検証時のマニフェストと初回移管の記録は [verification/](verification/) にあります。機能ガイドには手順を説明するための小さなSB3サンプルも付属します。

素材のライセンスと由来は [NOTICE.md](NOTICE.md) を参照してください。
