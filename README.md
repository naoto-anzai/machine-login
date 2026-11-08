# machine-login

接続が切れて `hc machine ls` が needs_login になったら、ポップアップでログインを促し、小さな端末の中で `hc machine login <name>` を実行して、パスワードをそこに入力させる。

- 常駐: レイアウトに floating で置く(何も描かない)。5秒ごとに状態を見る
- 手動: `mod.open:machine-login`

    ln -s ~/Projects/herdr-mods/machine-login ~/.config/herdr-app/mods/machine-login
