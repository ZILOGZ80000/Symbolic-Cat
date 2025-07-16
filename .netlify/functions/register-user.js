const crypto = require('crypto');

exports.handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    };

    try {
        // Проверка метода
        if (event.httpMethod !== 'POST') {
            return {
                statusCode: 405,
                headers,
                body: JSON.stringify({ error: 'Недопустимый метод читак тупой' })
            };
        }

        // Проверка AUTH_KEY
        const authToken = event.headers['auth'];
        const AUTH_KEY = process.env.AUTH_KEY;
        
        if (authToken !== `Basic ${AUTH_KEY}`) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({
                    error: 'Доступ запрещен',
                    message: '🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕🖕'
                })
            };
        }

        // Парсим данные
        const data = JSON.parse(event.body);
        const username = data.username?.trim();
        const email = data.email?.trim();
        const password = data.password;

        // Проверка обязательных полей
        if (!username || !password) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Ошибка данных',
                    message: 'Имя и пароль обязательны!'
                })
            };
        }

        // Проверка наличия спец. символов в имени
        if (/[:;=@\s]/.test(username)) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Неверное имя',
                    message: 'Твоё имя похоже на.. хм... инъекцию?'
                })
            };
        }

        // Проверка переменных среды
        const DB_URL = process.env.DB_URL;
        const DB_KEY = process.env.DB_KEY;

        if (!DB_URL || !DB_KEY) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Ошибка сервера',
                    message: 'Сервер сломался на нашей стороне :)' 
                })
            };
        }

        // Получаем текущих пользователей из базы
        const getResponse = await fetch(`${DB_URL}/users`, {
            method: 'GET',
            headers: { 'token': DB_KEY }
        });

        // Обработка ошибок получения данных
        if (!getResponse.ok) {
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({
                    error: 'Ошибка базы данных',
                    message: 'База данных не отвечает, попробуй позже'
                })
            };
        }

        // Парсим данные пользователей
        const usersDB = await getResponse.json();
        
        // Проверка существующего пользователя
        if (usersDB[username]) {
            return {
                statusCode: 409,
                headers,
                body: JSON.stringify({
                    error: 'Имя занято',
                    message: 'Такой пользователь уже существует!'
                })
            };
        }

        // Хеширование пароля
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = crypto.createHash('sha256')
            .update(password + salt)
            .digest('hex');
        
        // Создаем нового пользователя
        usersDB[username] = {
            email: email || '',
            password: salt + '.' + passwordHash, 
            createdAt: new Date().toISOString(),
            lastLogin: null,
            settings: {}
        };

        // Обновляем базу данных
        const updateResponse = await fetch(`${DB_URL}/users`, {
            method: 'POST',
            headers: {
                'token': DB_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(usersDB)
        });

        // Проверка обновления
        if (!updateResponse.ok) {
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({
                    error: 'Ошибка сохранения',
                    message: 'Не удалось сохранить твои данные '
                })
            };
        }

        // Успешный ответ
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: `Ты зарегистрирован!`,
                user: {
                    username,
                    email
                }
            })
        };

    } catch (error) {
        console.error('Ошибка сервера:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Ошибка сервера',
                message: 'Что-то пошло не так',
                ...(process.env.NODE_ENV === 'development' && { debug: error.message })
            })
        };
    }
};
