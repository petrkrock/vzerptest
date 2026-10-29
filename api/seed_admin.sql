-- v1.35.3: валидный bcrypt-хеш пароля admin123 (генерировался seed_hash.js вручную —
-- теперь пароль работает сразу после наката сидера, без отдельного UPDATE).
INSERT INTO public.profiles (id, email, role, password_hash)
VALUES ('00000000-0000-4000-8000-000000000099', 'admin@vz.tech', 'admin', '$2b$10$T0cGg6Zt8k7FJ1wOWgag6eGqerQx3/QBebImYSuhnvwuCwKCROLAm')
ON CONFLICT (id) DO UPDATE SET email='admin@vz.tech', role='admin', password_hash='$2b$10$T0cGg6Zt8k7FJ1wOWgag6eGqerQx3/QBebImYSuhnvwuCwKCROLAm';