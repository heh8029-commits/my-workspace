// 미리토퍼 사진 접수 시스템 - 프런트엔드 공용 설정
// anon(publishable) key 는 공개돼도 되는 키입니다. 테이블은 RLS 로 보호되고, 실제 처리는 서버 함수에서만 합니다.
window.MIRITOPPER_CONFIG = {
  SUPABASE_URL: "https://zuoztgnzrfhukdibrlxz.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1b3p0Z256cmZodWtkaWJybHh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MDk4MDcsImV4cCI6MjEwMDE4NTgwN30.mfZ6lPhOLOUtCcOBzb5YeY6RMIFMl_W-oLqbQY8YEao",
};
window.MIRITOPPER_CONFIG.FUNCTIONS_URL =
  window.MIRITOPPER_CONFIG.SUPABASE_URL + "/functions/v1";
