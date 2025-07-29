import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { setDoc, doc } from "firebase/firestore";
import { auth, db } from "../utils/firebase";

interface RegisterScreenProps {
  onNavigateToLogin: () => void;
}

export const RegisterScreen: React.FC<RegisterScreenProps> = ({
  onNavigateToLogin,
}) => {
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [puesto, setPuesto] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, correo, password);
      await setDoc(doc(db, "usuarios", userCredential.user.uid), {
        nombre,
        correo,
        puesto,
        creado: new Date()
      });
      setSuccess("¡Usuario registrado exitosamente!");
      setTimeout(() => onNavigateToLogin(), 1500);
    } catch (err: any) {
      setError("Error al registrar usuario. Revisa los datos.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-100 to-purple-100">
      <div className="relative w-full max-w-md">
        {/* Sombra de tarjeta */}
        <div className="absolute inset-0 blur-xl opacity-40 bg-blue-400 rounded-3xl z-0" />
        <form
          onSubmit={handleRegister}
          className="relative z-10 bg-white rounded-3xl shadow-2xl p-10 flex flex-col gap-4 animate-fade-in"
        >
          <h2 className="text-3xl font-extrabold text-blue-800 mb-2 text-center tracking-tight">
            Crear cuenta
          </h2>
          <p className="text-gray-400 mb-3 text-center text-sm">
            Sistema Equipos y Servicios AG
          </p>
          {error && <div className="bg-red-100 text-red-700 rounded px-3 py-2 mb-1 text-center text-sm">{error}</div>}
          {success && <div className="bg-green-100 text-green-700 rounded px-3 py-2 mb-1 text-center text-sm">{success}</div>}
          <input
            className="w-full px-4 py-2 border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-300 outline-none transition text-lg"
            type="text"
            placeholder="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            autoFocus
          />
          <input
            className="w-full px-4 py-2 border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-300 outline-none transition text-lg"
            type="email"
            placeholder="Correo electrónico"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            required
          />
          <input
            className="w-full px-4 py-2 border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-300 outline-none transition text-lg"
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
          <input
            className="w-full px-4 py-2 border border-blue-200 rounded-xl focus:ring-2 focus:ring-blue-300 outline-none transition text-lg"
            type="text"
            placeholder="Puesto"
            value={puesto}
            onChange={(e) => setPuesto(e.target.value)}
            required
          />
          <button
            type="submit"
            className="w-full bg-gradient-to-r from-blue-600 to-purple-500 hover:from-blue-700 hover:to-purple-600 text-white rounded-xl py-2 font-bold text-lg shadow transition-all duration-200 mt-2"
          >
            Registrarse
          </button>
          <button
            type="button"
            className="w-full text-blue-700 hover:underline font-medium text-center py-1 mt-1 transition"
            onClick={onNavigateToLogin}
          >
            Volver al login
          </button>
        </form>
      </div>
      {/* Animación fade-in */}
      <style>
        {`
        .animate-fade-in {
          animation: fadein 0.8s cubic-bezier(.4,0,.2,1);
        }
        @keyframes fadein {
          from { opacity: 0; transform: translateY(20px);}
          to { opacity: 1; transform: none;}
        }
        `}
      </style>
    </div>
  );
};
