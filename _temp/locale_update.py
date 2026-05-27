import json, os
base = r'E:\Stable_Diffusion\ComfyUI-Easy-CU130_Developer\ComfyUI\custom_nodes\xcpDerpNodes\locales'

# en-US
with open(f'{base}/en-US.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)
data['derp_image_deck']['tooltips'] = {
    'folder_selector': 'Selects {{t_toolTip_highlight::Folder Path}} where the image will be saved to disk'
}
with open(f'{base}/en-US.json', 'w', encoding='utf-8', newline='\n') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('en-US done')

# zh-CN
with open(f'{base}/zh-CN.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)
data['derp_image_deck']['tooltips'] = {
    'folder_selector': '选择 {{t_toolTip_highlight::文件夹路径}} 图像将保存到磁盘的位置'
}
with open(f'{base}/zh-CN.json', 'w', encoding='utf-8', newline='\n') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('zh-CN done')
