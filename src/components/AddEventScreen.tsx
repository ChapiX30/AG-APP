import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Calendar, Clock, MapPin, Users, FileText, ArrowLeft, Save, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Card } from './ui/card';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Calendar as CalendarComponent } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { useToast } from '../hooks/use-toast';

interface Event {
  id: string;
  title: string;
  date: Date;
  time: string;
  description: string;
  location?: string;
  attendees?: number;
  category: 'meeting' | 'personal' | 'work' | 'important';
  color: string;
}

const categoryColors = {
  meeting: '#3b82f6',
  personal: '#10b981',
  work: '#f59e0b',
  important: '#ef4444'
};

const AddEventScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  
  const editEvent = location.state?.editEvent as Event | undefined;
  const isEditing = !!editEvent;

  const [formData, setFormData] = useState({
    title: '',
    date: new Date(),
    time: '',
    description: '',
    location: '',
    attendees: '',
    category: 'meeting' as const
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editEvent) {
      setFormData({
        title: editEvent.title,
        date: editEvent.date,
        time: editEvent.time,
        description: editEvent.description,
        location: editEvent.location || '',
        attendees: editEvent.attendees?.toString() || '',
        category: editEvent.category
      });
    }
  }, [editEvent]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'El título es requerido';
    }

    if (!formData.time) {
      newErrors.time = 'La hora es requerida';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'La descripción es requerida';
    }

    if (formData.attendees && isNaN(Number(formData.attendees))) {
      newErrors.attendees = 'El número de asistentes debe ser un número';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      const eventData: Event = {
        id: editEvent?.id || Date.now().toString(),
        title: formData.title,
        date: formData.date,
        time: formData.time,
        description: formData.description,
        location: formData.location || undefined,
        attendees: formData.attendees ? Number(formData.attendees) : undefined,
        category: formData.category,
        color: categoryColors[formData.category]
      };

      // Here you would normally save to backend
      console.log('Saving event:', eventData);

      toast({
        title: isEditing ? 'Evento actualizado' : 'Evento creado',
        description: `${eventData.title} se ha ${isEditing ? 'actualizado' : 'creado'} exitosamente`,
      });

      navigate('/calendar');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Hubo un problema al guardar el evento',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              onClick={() => navigate('/calendar')}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-white">
                {isEditing ? 'Editar Evento' : 'Nuevo Evento'}
              </h1>
              <p className="text-slate-400">
                {isEditing ? 'Modifica los detalles del evento' : 'Crea un nuevo evento en tu calendario'}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <Card className="bg-slate-800 border-slate-700 shadow-2xl">
          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title" className="text-white font-medium">
                Título del evento *
              </Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Ej: Reunión de equipo"
                className="bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                disabled={isSubmitting}
              />
              {errors.title && (
                <p className="text-red-400 text-sm">{errors.title}</p>
              )}
            </div>

            {/* Date and Time */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-white font-medium">Fecha *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
                      disabled={isSubmitting}
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      {format(formData.date, 'dd/MM/yyyy', { locale: es })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-slate-800 border-slate-700">
                    <CalendarComponent
                      mode="single"
                      selected={formData.date}
                      onSelect={(date) => date && setFormData(prev => ({ ...prev, date }))}
                      className="text-white"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="time" className="text-white font-medium">
                  Hora *
                </Label>
                <div className="relative">
                  <Clock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="time"
                    type="time"
                    value={formData.time}
                    onChange={(e) => handleInputChange('time', e.target.value)}
                    className="bg-slate-700 border-slate-600 text-white pl-10"
                    disabled={isSubmitting}
                  />
                </div>
                {errors.time && (
                  <p className="text-red-400 text-sm">{errors.time}</p>
                )}
              </div>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label className="text-white font-medium">Categoría *</Label>
              <Select 
                value={formData.category} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, category: value as any }))}
                disabled={isSubmitting}
              >
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="meeting">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <span>Reunión</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="personal">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      <span>Personal</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="work">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                      <span>Trabajo</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="important">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <span>Importante</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Location and Attendees */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="location" className="text-white font-medium">
                  Ubicación
                </Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                    placeholder="Ej: Sala de conferencias"
                    className="bg-slate-700 border-slate-600 text-white placeholder-slate-400 pl-10"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="attendees" className="text-white font-medium">
                  Número de asistentes
                </Label>
                <div className="relative">
                  <Users className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    id="attendees"
                    type="number"
                    value={formData.attendees}
                    onChange={(e) => handleInputChange('attendees', e.target.value)}
                    placeholder="Ej: 5"
                    className="bg-slate-700 border-slate-600 text-white placeholder-slate-400 pl-10"
                    disabled={isSubmitting}
                  />
                </div>
                {errors.attendees && (
                  <p className="text-red-400 text-sm">{errors.attendees}</p>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description" className="text-white font-medium">
                Descripción *
              </Label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="Describe los detalles del evento..."
                  className="bg-slate-700 border-slate-600 text-white placeholder-slate-400 pl-10 min-h-[100px]"
                  disabled={isSubmitting}
                />
              </div>
              {errors.description && (
                <p className="text-red-400 text-sm">{errors.description}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-4 pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/calendar')}
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
                disabled={isSubmitting}
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button
                type="submit"
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {isEditing ? 'Actualizar' : 'Crear'} Evento
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default AddEventScreen;