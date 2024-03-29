# Sender Distribution（Thunderbird用アドオン）

<img src="https://github.com/ttrono/imgbox/blob/master/sender-distribution_sample.png" width="70%">


## 役割

POP3で受信したメールを送信メールアドレス単位に振り分けるアドオンです。

振分設定をせずに受信ボックスに溜め込みすぎたメールの整理に役立つと思います。


## 使い方 (windows)

1. Thunderbird終了。

2. 当プロジェクトを下記のフォルダに配置。

```
C:\Users\developer\AppData\Roaming\Thunderbird\Profiles\{プロファイルID}\extensions\sender-distribution
```

3. 下記のポインタファイルを配置。

ファイル名： senderdist@gmail.com

ファイル格納先
```
C:\Users\developer\AppData\Roaming\Thunderbird\Profiles\{プロファイルID}\extensions
```

ファイル内容
```
C:\Users\developer\AppData\Roaming\Thunderbird\Profiles\{プロファイルID}\extensions\sender-distribution
```

4. Thunderbirdを起動し、Sender Distributionアドオンを有効化。

5. メニューバー > ツール > Sender Distributionより起動。

## 動作確認済みバージョン

* Windows:  ver 60.7.2
* Mac: ver 60.7.2
* Linux: ver 60.7.1

## 注意事項

* エラーが発生した場合、下記のファイルにエラーログが出力されます。ログファイルは自動削除されないため、エラー解消後に手作業で削除してください。

```
C:\Users\developer\AppData\Roaming\Thunderbird\Profiles\{プロファイルID}\sender-distribution.log
```
