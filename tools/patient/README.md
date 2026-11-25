# 病人模型生成脚本

数据来源：MakeHuman 1.x 仓库 `makehuman/data`（基础网格 base.obj、macrodetails 目标、default 骨骼与权重、低模眼球、面部 poseunits），均为 CC0。脚本中的 `D` 路径指向该仓库的本地稀疏检出。

顺序：
1. `build_patient.py`：按年龄/性别/人种/体重生成网格，缩放到 1.58 m，计算骨骼，重设为自然站姿，调整臀部与腹股沟权重。
2. `morphs.py`：用面部 poseunits 烘焙眨眼、张口、微笑等形变目标。
3. `export2.py`：拆分身体、腿部、眼、牙、舌，生成上衣、长裤、内衣、鞋、短发，导出 patient.json/bin。
4. `bake.py`（UV 栅格化）与 `skin.py`：烘焙全身皮肤贴图和凹凸贴图。
5. `legdata.py`：导出左右腿皮肤网格和 legR 查找表（anatomy.js 用）。
6. `node dumpveins.mjs`：导出曲张属支曲线；`legbake.py`：左腿网格细分、静脉隆起、色素沉着贴图。
