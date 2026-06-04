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
        'kitchen_style',
        'wall_a_length',
        'wall_b_length',
        'wall_c_length',
        'ceiling_height',
        'status',
    ];

    protected $casts = [
        'wall_a_length' => 'integer',
        'wall_b_length' => 'integer',
        'wall_c_length' => 'integer',
        'ceiling_height' => 'integer',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function modules(): HasMany
    {
        return $this->hasMany(KitchenModule::class)->orderBy('wall')->orderBy('position');
    }

    public function quote(): HasOne
    {
        return $this->hasOne(KitchenQuote::class);
    }
}
