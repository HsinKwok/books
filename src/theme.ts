/** 主题的同步脚本：首屏绘制前把主题写进 <html data-theme>，避免闪一下 */
export const themeScript = (theme: string) =>
  `try{var t=localStorage.getItem('read.theme')||'${theme}';document.documentElement.dataset.theme=t}catch(e){}`;
