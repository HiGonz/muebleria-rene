<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProjectDimension extends Model
{
    protected $fillable = ['project_id', 'height', 'width', 'depth', 'shelves', 'drawers', 'doors'];

    public function project()
    {
        return $this->belongsTo(Project::class);
    }
}
