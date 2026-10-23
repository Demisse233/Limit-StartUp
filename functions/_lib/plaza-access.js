export function isPlazaAdmin(email,env){
 return String(env.PLAZA_ADMIN_EMAILS ?? 'eric_demisse@163.com').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean).includes(String(email||'').toLowerCase());
}
