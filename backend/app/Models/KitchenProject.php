<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class KitchenProject extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id',
        'client_name',
        'client_phone',
        'project_name',
        'notes',
        'room_width',
        'room_depth',
        'ceiling_height',
        'openings',
        'status',
    ];

    protected $casts = [
        'room_width' => 'integer',
        'room_depth' => 'integer',
        'ceiling_height' => 'integer',
        'openings' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function modules(): HasMany
    {
        return $this->hasMany(KitchenModule::class);
    }

    public function quote(): HasOne
    {
        return $this->hasOne(KitchenQuote::class);
    }

    public function shares(): HasMany
    {
        return $this->hasMany(KitchenProjectShare::class);
    }

    public function activeShare(): HasOne
    {
        return $this->hasOne(KitchenProjectShare::class)->active()->latestOfMany();
    }
}
