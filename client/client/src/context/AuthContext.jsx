import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
        setLoading(false);
    }, []);

    const login = async (username, password) => {
        const res = await axios.post('https://ezyedutube-backend.onrender.com/api/auth/login', { username, password });
        setUser(res.data);
        localStorage.setItem('user', JSON.stringify(res.data));
    };

    const register = async (username, password) => {
        await axios.post(https://ezyedutube-backend.onrender.com/api/auth/register', { username, password });
        await login(username, password);
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('user');
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
