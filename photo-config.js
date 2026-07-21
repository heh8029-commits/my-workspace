// 미리토퍼 사진 접수 시스템 - 프런트엔드 공용 설정
// ▼ 본인 Supabase 프로젝트 값으로 교체하세요 (anon key 는 공개돼도 되는 키입니다).
window.MIRITOPPER_CONFIG = {
  // 예: https://abcdefghijklmno.supabase.co
  SUPABASE_URL: "https://PROJECT_REF.supabase.co",
  // Supabase > Project Settings > API > anon public key
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
};
window.MIRITOPPER_CONFIG.FUNCTIONS_URL =
  window.MIRITOPPER_CONFIG.SUPABASE_URL + "/functions/v1";
