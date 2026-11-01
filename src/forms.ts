/**
 * 表单取值：后台路由和前台路由共用同一份实现。
 */

/** 取表单字段并去掉首尾空白 */
export function formString(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}
