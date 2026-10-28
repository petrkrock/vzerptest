INSERT INTO public.profiles (id, email, role, password_hash)
VALUES ('00000000-0000-4000-8000-000000000099', 'admin@vz.tech', 'admin', '/LfPdMwp4wt9IsHA70Qi')
ON CONFLICT (id) DO UPDATE SET email='admin@vz.tech', role='admin', password_hash='/LfPdMwp4wt9IsHA70Qi';