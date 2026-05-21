<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DemoUserSeeder extends Seeder
{
    public function run(): void
    {
        User::updateOrCreate(
            ['email' => 'admin@demo.com'],
            ['name' => 'Administrador', 'password' => Hash::make('password'), 'role' => 'admin', 'active' => true],
        );

        User::updateOrCreate(
            ['email' => 'seller@demo.com'],
            ['name' => 'Vendedor', 'password' => Hash::make('password'), 'role' => 'seller', 'active' => true],
        );
    }
}
