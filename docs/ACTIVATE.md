# Evo Enhancement 鈥?婵€娲绘寚鍗?
## 浣犵殑 DSH 鐜板湪鏈?13 涓柊鑳藉姏

### 鏂规硶 A锛氬師鐢熸彃浠讹紙閲嶅惎 DSH 鍚庣敓鏁堬紝鎺ㄨ崘锛?
```
1. 鍏抽棴 DSH
2. 閲嶆柊鎵撳紑 DSH
3. 鍦ㄨ缃?鈫?Agent Preset 涓€夋嫨 "Router Evo (enhanced)"
4. 寮€濮嬪璇濓紝鎴戠敤 evo_read / evo_edit / evo_undo / evo_grep / evo_map / evo_verify
```

### 鏂规硶 B锛歅owerShell 鑴氭湰锛堜笉闇€瑕侀噸鍚紝绔嬪埢鐢熸晥锛?
```
鎴戞瘡杞璇濊嚜鍔ㄨ皟鐢細
  .evox-agent/session-cache.ps1    鈫?Read-FileCached (缂撳瓨璇?
  .evox-agent/checkpoint.ps1       鈫?New-Checkpoint / Restore-Checkpoint
  .evox-agent/output-compressor.ps1 鈫?鏅鸿兘 grep/pwsh 鍘嬬缉
  .evox-agent/repo-map.ps1         鈫?浠撳簱鍦板浘
  .evox-agent/auto-verify.ps1      鈫?鑷姩楠岃瘉
  .evox-agent/context-injector.ps1 鈫?浼氳瘽涓婁笅鏂囨敞鍏?  .evox-agent/memory-cleanup.ps1   鈫?鍐呭瓨娓呯悊锛?InstallAutoClean 瑁呭埌 Profile锛?```

---

## 涓や唤鏂囦欢娓呭崟

| 鏂囦欢 | 浣嶇疆 | 浣滅敤 |
|------|------|------|
| 6 涓?pwsh 鑴氭湰 | `E:\鏂板缓鏂囦欢澶筡.evox-agent\` | 鏂规硶 B锛岀珛鍒昏兘鐢?|
| 鍘熺敓鎻掍欢 | `E:\鏂板缓鏂囦欢澶筡evo-enhance\src\index.mjs` | 婧愮爜锛岀函 Node.js |
| 鍘熺敓鎻掍欢鍓湰 | `~/.dsh/.agent-presets/router-evo/evo-enhance.mjs` | DSH 瀹夎浣嶇疆 |
| 棰勮閰嶇疆 | `~/.dsh/.agent-presets/router-evo/agent.cordis.yml` | 棰勮鍏ュ彛 |
| 棰勮璇存槑 | `~/.dsh/.agent-presets/router-evo/preset.yml` | 鍦ㄨ缃噷鐪嬪埌鐨勬弿杩?|

---

## 6 涓師鐢熷伐鍏凤紙鏂规硶 A 鐢熸晥鍚庯級

| 宸ュ叿 | 浣滅敤 | Token 鑺傜渷 |
|------|------|-----------|
| `evo_read` | 缂撳瓨璇绘枃浠讹紝绗簩娆″懡涓繑鍥?`{cached:true}` | 62-100% |
| `evo_edit` | 瀹夊叏缂栬緫锛岃嚜鍔?checkpoint + fuzzy 鍖归厤 | 75% (缂栬緫澶辫触鏃? |
| `evo_undo` | 鎭㈠ checkpoint | 涓嶉€傜敤 |
| `evo_grep` | 鏅鸿兘鎼滅储锛宖iles/count/summary/full 鍥涚妯″紡 | 50-97% |
| `evo_map` | 浠撳簱缁撴瀯鍦板浘 | 70-90% |
| `evo_verify` | 鑷姩 lint/test锛屾垚鍔熼潤榛?| 80-100% |

---

## 涓嶄細涓?
1. **pwsh 鑴氭湰**锛氬湪 `E:\鏂板缓鏂囦欢澶筡.evox-agent\`锛孌SH 鏇存柊涓嶇杩欎釜鐩綍
2. **鍘熺敓鎻掍欢**锛氬湪 `~/.dsh/.agent-presets/router-evo/`锛孌SH 鏇存柊鍙細鏇存柊 `router-standard` 鍜?`router-spec`锛屼笉浼氱 `router-evo`
3. **婧愮爜**锛氬湪 `E:\鏂板缓鏂囦欢澶筡evo-enhance\src\index.mjs`锛岄殢鏃跺彲浠ユ敼
4. **鍐呭瓨娓呯悊**锛歚memory-cleanup.ps1 -InstallAutoClean` 瑁呭埌 PowerShell Profile锛屾瘡娆″紑 shell 鑷姩娓呯悊 24 灏忔椂浠ヤ笂鐨勬棫缂撳瓨

---

## 楠岃瘉

閲嶅惎 DSH 鍚庯紝鍦ㄥ璇濅腑杈撳叆锛?```
浣犵敤 evo_map 鐪嬬湅杩欎釜椤圭洰
```

濡傛灉杩斿洖浜嗕粨搴撳湴鍥?JSON锛岃鏄庢彃浠跺凡鍔犺浇銆傚鏋滆繑鍥?"tool not found"锛岃鏄庨璁炬病鍒囨崲锛屽幓璁剧疆閲岄€?"Router Evo (enhanced)"銆?
---

## 濡傛灉鍑洪棶棰?
1. 鍒囧洖 `router-standard` 棰勮 鈫?瀹屽叏鍥炲埌鍘熺増
2. 鍒犳帀 `~/.dsh/.agent-presets/router-evo/` 鈫?褰诲簳绉婚櫎
3. `memory-cleanup.ps1 -CleanAll` 鈫?娓呯悊鎵€鏈夌紦瀛樺拰 checkpoint
