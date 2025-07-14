const crypto = require('crypto');


exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Метод не поддерживается' })
    };
  }

  try {
    const { username, email, password } = JSON.parse(event.body);
    
    // Валидация входных данных
    if (!username || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Имя пользователя и пароль обязательны' })
      };
    }

    // Проверка имени на допустимые символы
    if (username.length < 3 || username.length > 20 || !/^[a-zA-Z0-9_а-яА-Я ]+$/.test(username)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Имя пользователя должно быть от 3 до 20 символов и содержать только буквы, цифры, пробелы и подчеркивание' })
      };
    }

    // Хеширование пароля с солью
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = crypto.createHash('sha256')
      .update(password + salt)
      .digest('hex');
    const saltedHash = salt + '.' + passwordHash;

    // Получение данных из Gist
    const gistId = process.env.GIST_ID;
    const gistUrl = `https://api.github.com/gists/${gistId}`;
    const gistResponse = await fetch(gistUrl);
    
    if (!gistResponse.ok) {
      throw new Error(`Ошибка загрузки Gist: ${gistResponse.status}`);
    }

    const gistData = await gistResponse.json();
    const accounts = JSON.parse(gistData.files['accounts.json'].content);

    // Проверка уникальности имени пользователя
    if (accounts.hasOwnProperty(username)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Имя пользователя уже занято' })
      };
    }

    // Создание объекта пользователя
    accounts[username] = {
      email: email || null,
      password: saltedHash,
      fish: 0,
      level: 0,
      type: "user",
      icon: "avatar.json",
      clan: null,
      friends: [],
      skins: [0],
      achievements: [],
      inactive_promocodes: [],
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString()
    };

    // Обновление Gist
    const updateResponse = await fetch(gistUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GIST_TOKEN}`
      },
      body: JSON.stringify({
        files: {
          'accounts.json': {
            content: JSON.stringify(accounts, null, 2)
          }
        }
      })
    });

    if (!updateResponse.ok) {
      throw new Error(`Ошибка обновления Gist: ${updateResponse.status}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Пользователь успешно зарегистрирован',
        username: username
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        message: 'Внутренняя ошибка сервера',
        details: error.message 
      })
    };
  }
};
