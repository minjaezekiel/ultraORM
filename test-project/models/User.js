const { Model, StringField,IntegerField , EmailField,BooleanField} = require('ultraorm');
const { BooleanField, DateTimeField, ForeignKey } = require('ultraorm/core');


class User extends Model {
  static tableName = 'users';
  static fields = {
    id: new IntegerField({autoIncrement:true,primaryKey:true}),
    name: new StringField({ nullable: false }),
    email: new EmailField({ unique: true, nullable: false }),
  };
}

class Analytics extends Model{
  static tableName = 'analytics';
  static fields = {
    id: new IntegerField({autoIncrement:true,primaryKey:true}),
    device: new StringField({nullable: true}),
    country: new StringField({nullable: true}),
    ip: new StringField({nullable: true}),
    created_at: new DateTimeField({autoNowAdd:true})
  }
}

class Blog extends Model{
  static tableName = 'blogs';
  static fields = {
    id: new IntegerField({autoIncrement:true,primaryKey:true}),
    title: new StringField({maxLength:300,nullable:false}),
    content: new StringField({nullable:false}),
    author: new ForeignKey('User',{onDelete: 'CASCADE'}),
    created_at: new DateTimeField({autoNowAdd:true})
  }
}

class Contact extends Model{
  static tableName = 'contacts';
  static fields = {
    id: new IntegerField({autoIncrement:true,primaryKey:true}),
    fullname:new StringField({nullable: false}),
    email:new StringField({nullable: false}),
    phone:new StringField({nullable: false}),
    tour:new StringField({nullable: false}),
    message:new StringField({nullable: false}),
    created_at: new DateTimeField({autoNowAdd:true})
  }
}

class Gallery extends Model{
  static tableName = 'gallery';
  static fields = {
    id: new IntegerField({autoIncrement:true,primaryKey:true}),
    alt: new StringField({nullable: false}),
    src: new StringField({nullable: false}),
    created_at: new DateTimeField({autoNowAdd:true})
  }
}

class Testimonials extends Model{
  static tableName = "testimonials";
  static fields = {
    id: new IntegerField({autoIncrement:true,primaryKey:true}),
    fullname: new StringField({nullable: false}),
    content: new StringField({nullable: false}),
    country: new StringField({nullable: false}),
  }
}

class Tours extends Model{
  static tableName = "tours";
  static fields = {
    id:  new IntegerField({autoIncrement:true,primaryKey:true}),
    title: new StringField({nullable: false}),
    description: new StringField({nullable: false}),
    price: new IntegerField({minLength:0, nullable:false}),
    link: new StringField({nullable: false}),
    image: new StringField(),
    created_at: new DateTimeField({autoNowAdd:true})
  }
}


module.exports = User;
