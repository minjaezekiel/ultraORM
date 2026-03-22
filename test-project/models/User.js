const { Model, StringField,IntegerField , EmailField } = require('ultraorm');


class User extends Model {
  static tableName = 'users';
  static fields = {
    id: new IntegerField({autoIncrement:true,primaryKey:true}),
    name: new StringField({ nullable: false }),
    email: new EmailField({ unique: true, nullable: false }),
    password: new StringField({ nullable: false })
  };
}

module.exports = User;
