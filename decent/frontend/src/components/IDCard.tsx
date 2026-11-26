"use client";

import React from 'react';
import { Mail, Phone, Globe, ShieldCheck ,X} from 'lucide-react';

interface IDCardProps {
  employee: {
    employee_id: string;
    full_name: string;
    designation?: { position_name: string } | null;
    department?: { dept_name: string } | null;
    email: string;
    phone: string;
    image?: string;
    join_date: string;
    cnic?: string;
  };
}

const IDCard: React.FC<IDCardProps> = ({ employee }) => {
  return (
    <div className="id-card-container p-8 bg-zinc-50 flex justify-center items-center">
  <div className="id-card w-[400px] bg-white rounded-[36px] overflow-hidden shadow-2xl border border-gray-200">

  {/* Header */}
  <div className="relative h-40 bg-gradient-to-br from-[#18315B] to-[#243E74]">

    {/* Logo */}
    <div className="absolute left-7 top-8 flex items-center gap-3">
      <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
        <span className="text-white font-black">AIT</span>
      </div>

      <div>
        <h2 className="text-white font-bold text-3xl tracking-tight">
          Idara Alkhair
        </h2>
      </div>
    </div>

    {/* Close */}
    <button className="absolute right-5 top-5 w-11 h-11 rounded-full bg-white flex items-center justify-center shadow">
      <X className="w-5 h-5 text-gray-700"/>
    </button>

    {/* Avatar */}
    <div className="absolute left-1/2 translate-x-[-50%] bottom-[-55px]">
      <div className="w-32 h-32 rounded-[30px] bg-gradient-to-b from-[#F2F5FA] to-[#DCE4F1] border-[5px] border-white shadow-xl flex items-center justify-center">

        {employee.image ? (
          <img
            src={employee.image}
            className="w-full h-full rounded-[26px] object-cover"
          />
        ) : (
          <span className="text-6xl font-black text-[#163C77]">
            {employee.full_name?.charAt(0)}
          </span>
        )}

      </div>
    </div>

  </div>

  {/* Body */}
  <div className="pt-20 px-6">

    <h2 className="text-center text-4xl font-bold text-[#1A2945]">
      {employee.full_name}
    </h2>

    <div className="flex justify-center mt-3">
      <span className="px-5 py-2 rounded-full bg-indigo-100 text-indigo-700 font-bold tracking-[3px] text-[11px] uppercase">
        {employee.designation?.position_name}
      </span>
    </div>

    {/* Email */}
    <div className="mt-8 bg-[#F6F7FB] rounded-3xl border border-gray-200 p-5 flex items-center justify-between">

      <div className="flex items-center gap-4">

        <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center">
          <Mail size={18}/>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[2px] text-gray-400 font-bold">
            Email
          </p>

          <p className="font-semibold text-gray-800">
            {employee.email}
          </p>
        </div>

      </div>

    </div>

    {/* Phone */}
    <div className="mt-4 bg-[#F6F7FB] rounded-3xl border border-gray-200 p-5 flex items-center justify-between">

      <div className="flex items-center gap-4">

        <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center">
          <Phone size={18}/>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-[2px] text-gray-400 font-bold">
            Phone
          </p>

          <p className="font-semibold text-gray-800">
            {employee.phone}
          </p>
        </div>

      </div>

    </div>

  </div>

  {/* Bottom */}
  <div className="bg-[#F3F4F6] mt-8 px-6 py-6 border-t">

    <div className="flex justify-between">

      <div>
        <p className="text-[10px] uppercase tracking-[2px] text-gray-400 font-bold">
          Employee ID
        </p>

        <h4 className="font-bold text-[#1B2744] mt-1">
          {employee.employee_id}
        </h4>
      </div>

      <div className="text-right">
        <p className="text-[10px] uppercase tracking-[2px] text-gray-400 font-bold">
          Member Since
        </p>

        <h4 className="font-bold text-[#1B2744] mt-1">
          {employee.join_date}
        </h4>
      </div>

    </div>

    {/* Buttons */}
    {/* <div className="flex gap-4 mt-6">

      <button className="flex-1 h-14 rounded-full border bg-white font-semibold shadow-sm">
        Back to Profile
      </button>

      <button className="flex-1 h-14 rounded-full bg-[#18315B] text-white font-semibold shadow-lg">
        Print Card
      </button>

    </div> */}

  </div>

</div>
      
      <style jsx>{`
        @media print {
          .id-card-container {
            padding: 0;
            background: white;
          }
          .id-card {
            box-shadow: none;
            border: 1px solid #e4e4e7;
          }
        }
      `}</style>
    </div>
  );
};

export default IDCard;

